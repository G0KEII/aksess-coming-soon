// Vercel serverless function: one-click unsubscribe from AKSESS emails.
//   POST /api/unsubscribe?e=...&t=...  marks the Resend contact unsubscribed.
//                                      This is what Gmail's and Yahoo's
//                                      one-click button calls (RFC 8058).
//   GET  /api/unsubscribe?e=...&t=...  shows a page that POSTs on load. A bare
//                                      GET never unsubscribes, so link scanners
//                                      can't unsubscribe people by accident.
// Environment variables in Vercel:
//   RESEND_API_KEY     (required, Full access key)
//   UNSUBSCRIBE_SECRET (required, must match the one used to sign the links)

import { verify } from './_unsubscribe-token.js';

const SUPPORT = 'support@getaksess.com';

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

function send(req, res, state, action) {
  const html = /text\/html/i.test(req.headers.accept || '');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const { status } = STATES[state];

  if (req.method === 'POST' && !html) {
    return res.status(status).json(
      state === 'done' ? { ok: true } : { error: state === 'invalid' ? 'Invalid link' : 'Could not unsubscribe' },
    );
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(status).send(page(state, action));
}

export default async function handler(req, res) {
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query = req.query || {};
  const e = typeof query.e === 'string' ? query.e : '';
  const t = typeof query.t === 'string' ? query.t : '';
  const email = verify(e, t);
  if (!email) return send(req, res, 'invalid');

  // e and t are verified base64url strings, so they're safe to echo back.
  const action = `/api/unsubscribe?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`;

  if (req.method !== 'POST') return send(req, res, 'pending', action);

  const updated = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
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
    return send(req, res, 'error', action);
  }
  return send(req, res, 'done', action);
}
