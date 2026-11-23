// Cloudflare Worker for getaksess.com. Static files come from ./public
// (Workers static assets); every /api/* request lands here first
// (see run_worker_first in wrangler.jsonc).
//
//   POST /api/subscribe                adds a waitlist email to Resend Contacts,
//                                      tagged with the AKSESS waitlist segment,
//                                      then sends a welcome email.
//   POST /api/unsubscribe?e=...&t=...  marks the Resend contact unsubscribed.
//                                      This is what Gmail's and Yahoo's
//                                      one-click button calls (RFC 8058).
//   GET  /api/unsubscribe?e=...&t=...  shows a page that POSTs on load. A bare
//                                      GET never unsubscribes, so link scanners
//                                      can't unsubscribe people by accident.
//
// Port of legacy-vercel/api/subscribe.js and unsubscribe.js, same behavior.
//
// Worker env (secrets / variables, same names as on Vercel):
//   RESEND_API_KEY     (required, Full access key)
//   RESEND_SEGMENT_ID  (recommended, keeps AKSESS signups apart from other lists)
//   RESEND_FROM        (optional, defaults to "AKSESS <hello@getaksess.com>";
//                       must be on a domain verified in Resend)
//   RESEND_REPLY_TO    (optional, inbox that receives replies to the welcome email)
//   UNSUBSCRIBE_SECRET (required for the welcome email and for unsubscribing,
//                       signs the unsubscribe link)
//   SITE_URL           (optional, base of the unsubscribe link, defaults to
//                       "https://getaksess.com")
//   RESEND_API_BASE_FOR_TESTS (local tests only: points Resend calls at a mock
//                       server. Ignored unless it is a localhost URL.)

import { subject, html, text } from './welcome-email.js';
import { verify, unsubscribeUrl, unsubscribeHeaders } from './unsubscribe-token.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORT = 'support@getaksess.com';

function resendBase(env) {
  const override = env.RESEND_API_BASE_FOR_TESTS;
  if (override && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(override)) return override;
  return 'https://api.resend.com';
}

function resend(env, path, body, method = 'POST') {
  return fetch(`${resendBase(env)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function json(status, data, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

// Matches what Vercel put in req.body: parsed JSON, parsed form fields,
// a plain string for text/plain, nothing for anything else.
async function readBody(request) {
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (type.includes('application/json')) {
    const raw = await request.text();
    if (!raw) return undefined;
    try {
      return { value: JSON.parse(raw) };
    } catch {
      return { invalid: true };
    }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return { value: Object.fromEntries(new URLSearchParams(await request.text())) };
  }
  if (type.includes('text/plain')) return { value: await request.text() };
  return undefined;
}

// ---------- POST /api/subscribe ----------

async function subscribe(request, env, ctx) {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' }, { Allow: 'POST' });
  }

  const parsed = await readBody(request);
  if (parsed && parsed.invalid) {
    return new Response('Invalid JSON', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const body = parsed && parsed.value;

  // Hidden "company" field: people never see it, bots fill it in.
  if (body && body.company) {
    return json(200, { ok: true });
  }

  const email = String((body && body.email) || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) {
    return json(400, { error: 'Invalid email' });
  }

  const contact = { email, unsubscribed: false };
  if (env.RESEND_SEGMENT_ID) {
    contact.segments = [{ id: env.RESEND_SEGMENT_ID }];
  }

  const created = await resend(env, '/contacts', contact);

  // 409: already on the list. Say yes, but don't send the welcome email again.
  // If they unsubscribed earlier, signing up again puts them back on.
  if (created.status === 409) {
    const resubscribed = await resend(
      env,
      `/contacts/${encodeURIComponent(email)}`,
      { unsubscribed: false },
      'PATCH',
    );
    if (!resubscribed.ok) {
      console.error('Resend resubscribe error', resubscribed.status, await resubscribed.text());
    }
    return json(200, { ok: true });
  }
  if (!created.ok) {
    console.error('Resend error', created.status, await created.text());
    return json(502, { error: 'Could not save email' });
  }

  // The signup already succeeded, so a failed welcome email is only logged.
  // Never send without a working unsubscribe link.
  if (!env.UNSUBSCRIBE_SECRET) {
    console.error('Welcome email error: UNSUBSCRIBE_SECRET is not set');
    return json(200, { ok: true });
  }

  const unsubscribe = await unsubscribeUrl(email, env);
  const welcome = {
    from: env.RESEND_FROM || 'AKSESS <hello@getaksess.com>',
    to: [email],
    subject,
    html: html({ unsubscribeUrl: unsubscribe }),
    text: text({ unsubscribeUrl: unsubscribe }),
    headers: await unsubscribeHeaders(email, env),
  };
  if (env.RESEND_REPLY_TO) welcome.reply_to = env.RESEND_REPLY_TO;

  const sent = await resend(env, '/emails', welcome);
  if (!sent.ok) {
    console.error('Welcome email error', sent.status, await sent.text());
  }

  return json(200, { ok: true });
}

// ---------- /api/unsubscribe ----------

const STATES = {
  pending: {
    status: 200,
    title: 'Unsubscribing…',
    body: 'One moment while we take you off the AKSESS list.',
  },
  done: {
    status: 200,
    title: "You're unsubscribed.",
    body: 'You won\'t get any more emails from AKSESS. Changed your mind? You can join again at <a href="https://getaksess.com">getaksess.com</a>.',
  },
  invalid: {
    status: 400,
    title: "This link doesn't work.",
    body: `It may be incomplete or out of date. Write to <a href="mailto:${SUPPORT}">${SUPPORT}</a> and we'll take you off the list.`,
  },
  error: {
    status: 502,
    title: 'Something went wrong.',
    body: `We couldn't unsubscribe you just now. Try again in a minute, or write to <a href="mailto:${SUPPORT}">${SUPPORT}</a> and we'll do it for you.`,
  },
};

function page(state, action) {
  const s = STATES[state];
  const pending = state === 'pending';
  const client = pending
    ? `
<noscript>
  <form method="post" action="${action}">
    <button type="submit">Unsubscribe</button>
  </form>
</noscript>
<script>
  (function () {
    var states = ${JSON.stringify({ done: STATES.done, error: STATES.error, invalid: STATES.invalid })};
    function show(name) {
      document.getElementById('title').textContent = states[name].title;
      document.getElementById('body').innerHTML = states[name].body;
      document.title = states[name].title + ' · AKSESS';
    }
    fetch(${JSON.stringify(action)}, { method: 'POST', headers: { Accept: 'application/json' } })
      .then(function (r) { show(r.ok ? 'done' : r.status === 400 ? 'invalid' : 'error'); })
      .catch(function () { show('error'); });
  })();
</script>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light">
<title>${s.title} · AKSESS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap">
<style>
  :root { --teal: #006B68; --deep: #00403E; --mint: #C8E6DF; --warm: #F4F5EF; --muted: #4C6664; --coral: #FF735E; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    min-height: 100vh; min-height: 100dvh;
    background: var(--warm); color: #0E2A29;
    font-family: 'DM Sans', Arial, Helvetica, sans-serif;
    display: flex; align-items: center; justify-content: center;
    padding: 32px 16px;
  }
  main { width: 100%; max-width: 480px; }
  .brand { font-weight: 700; font-size: 14px; letter-spacing: 4px; color: var(--deep); margin: 0 0 20px 4px; }
  .card { background: #FFFFFF; border-radius: 20px; padding: 36px 28px; border-bottom: 3px solid var(--coral); }
  h1 { margin: 0; font-family: 'Fraunces', Georgia, 'Times New Roman', serif; font-weight: 400; font-size: 34px; line-height: 1.15; color: var(--deep); }
  p { margin: 16px 0 0; font-size: 16px; line-height: 1.55; color: var(--muted); }
  a { color: var(--teal); font-weight: 500; overflow-wrap: anywhere; }
  button {
    margin-top: 24px; appearance: none; border: 0; border-radius: 999px;
    background: var(--teal); color: #FFFFFF; font: 500 16px/1 'DM Sans', Arial, sans-serif;
    padding: 14px 24px; cursor: pointer;
  }
  button:hover { background: var(--deep); }
  .line { margin: 24px 4px 0; font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 18px; color: var(--teal); }
  @media (max-width: 400px) { .card { padding: 28px 20px; } h1 { font-size: 28px; } }
</style>
</head>
<body>
<main>
  <div class="brand">AKSESS</div>
  <div class="card">
    <h1 id="title">${s.title}</h1>
    <p id="body">${s.body}</p>${client}
  </div>
  <div class="line">Be where it happens.</div>
</main>
</body>
</html>`;
}

function send(request, state, action) {
  const wantsHtml = /text\/html/i.test(request.headers.get('accept') || '');
  const headers = {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
  };
  const { status } = STATES[state];

  if (request.method === 'POST' && !wantsHtml) {
    return json(
      status,
      state === 'done' ? { ok: true } : { error: state === 'invalid' ? 'Invalid link' : 'Could not unsubscribe' },
      headers,
    );
  }
  headers['Content-Type'] = 'text/html; charset=utf-8';
  const body = request.method === 'HEAD' ? null : page(state, action);
  return new Response(body, { status, headers });
}

// Vercel's req.query gave an array for a repeated key; the old code treated
// anything that wasn't a single string as missing.
function single(params, key) {
  const all = params.getAll(key);
  return all.length === 1 ? all[0] : '';
}

async function unsubscribe(request, env) {
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
    return json(405, { error: 'Method not allowed' }, { Allow: 'GET, POST' });
  }

  const params = new URL(request.url).searchParams;
  const e = single(params, 'e');
  const t = single(params, 't');
  const email = await verify(e, t, env);
  if (!email) return send(request, 'invalid');

  // e and t are verified base64url strings, so they're safe to echo back.
  const action = `/api/unsubscribe?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`;

  if (request.method !== 'POST') return send(request, 'pending', action);

  const updated = await fetch(`${resendBase(env)}/contacts/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ unsubscribed: true }),
  }).catch((err) => {
    console.error('Unsubscribe error', err);
    return null;
  });

  // 404: the contact is already gone, which is as unsubscribed as it gets.
  if (!updated || (!updated.ok && updated.status !== 404)) {
    if (updated) console.error('Unsubscribe error', updated.status, await updated.text());
    return send(request, 'error', action);
  }
  return send(request, 'done', action);
}

// ---------- router ----------

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/api/subscribe') return await subscribe(request, env, ctx);
      if (pathname === '/api/unsubscribe') return await unsubscribe(request, env);
    } catch (err) {
      // Vercel answered an uncaught error with a 500, so do the same.
      console.error('Unhandled error', err);
      return new Response('Internal Server Error', { status: 500 });
    }
    // Any other /api/* path, or a path with no matching static file.
    return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};
