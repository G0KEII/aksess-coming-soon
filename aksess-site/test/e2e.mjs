// End-to-end check against `wrangler dev` (local workerd, nothing deployed).
// Starts a mock Resend server on localhost, starts wrangler dev with fake vars
// pointing Resend calls at it, runs the checks, then stops both.
// Never calls the real Resend API and never sends an email.
//
//   npm run test:e2e

import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const DEV_PORT = Number(process.env.E2E_PORT || 8799);
const DEV = `http://127.0.0.1:${DEV_PORT}`;

// ---------- mock Resend ----------
const calls = [];
const mock = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ method: req.method, path: req.url, auth: req.headers.authorization, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST' && req.url === '/contacts') {
      // Emails starting with "existing" are already on the list.
      if (body.email.startsWith('existing')) return res.writeHead(409).end('{"message":"exists"}');
      return res.writeHead(201).end('{"id":"contact_fake"}');
    }
    if (req.method === 'PATCH' && req.url.startsWith('/contacts/')) return res.writeHead(200).end('{}');
    if (req.method === 'POST' && req.url === '/emails') return res.writeHead(200).end('{"id":"email_fake"}');
    res.writeHead(404).end('{}');
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const MOCK = `http://127.0.0.1:${mock.address().port}`;

// ---------- wrangler dev ----------
const vars = {
  RESEND_API_KEY: 're_fake_key_for_e2e',
  RESEND_SEGMENT_ID: 'seg_fake',
  RESEND_FROM: 'AKSESS Test <test@example.com>',
  RESEND_REPLY_TO: 'reply@example.com',
  UNSUBSCRIBE_SECRET: 'fake-e2e-unsubscribe-secret',
  SITE_URL: DEV,
  RESEND_API_BASE_FOR_TESTS: MOCK,
};
const args = [
  'node_modules/wrangler/bin/wrangler.js', 'dev',
  '--ip', '127.0.0.1', '--port', String(DEV_PORT),
  '--show-interactive-dev-session=false',
  ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`]),
];
const dev = spawn(process.execPath, args, {
  cwd: root,
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let devLog = '';
dev.stdout.on('data', (d) => (devLog += d));
dev.stderr.on('data', (d) => (devLog += d));
console.log(`wrangler dev started, PID ${dev.pid}; mock Resend at ${MOCK}`);

function stop() {
  // Only the processes this script started, by PID.
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(dev.pid), '/T', '/F'], { stdio: 'ignore' });
    else dev.kill('SIGTERM');
  } catch {}
  mock.close();
}

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    if (dev.exitCode !== null) throw new Error('wrangler dev exited:\n' + devLog);
    try {
      const r = await fetch(DEV + '/');
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('wrangler dev did not start:\n' + devLog);
}

let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${err.message.split('\n').join('\n        ')}`);
  }
}

const post = (path, body, headers = {}) =>
  fetch(DEV + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const since = (n) => calls.slice(n);

try {
  await waitReady();

  await check('GET / serves index.html', async () => {
    const r = await fetch(DEV + '/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(await r.text(), /id="signup"/);
  });

  await check('GET /email/hero.jpg serves the image', async () => {
    const r = await fetch(DEV + '/email/hero.jpg');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /image\/jpeg/);
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.ok(bytes.equals(readFileSync(new URL('../public/email/hero.jpg', import.meta.url))), 'bytes differ');
  });

  for (const p of [
    '/api/welcome-email-preview.html', '/api/_unsubscribe-token.js', '/api/subscribe.js',
    '/legacy-vercel/api/welcome-email-preview.html', '/src/worker.js', '/wrangler.jsonc',
    '/package.json', '/.dev.vars', '/test/e2e.mjs', '/api/', '/nope',
  ]) {
    await check(`GET ${p} is 404`, async () => {
      const r = await fetch(DEV + p, { redirect: 'manual' });
      assert.equal(r.status, 404);
    });
  }

  await check('GET /api/subscribe is 405 with Allow: POST', async () => {
    const r = await fetch(DEV + '/api/subscribe');
    assert.equal(r.status, 405);
    assert.equal(r.headers.get('allow'), 'POST');
    assert.deepEqual(await r.json(), { error: 'Method not allowed' });
  });

  let link;
  await check('signup happy path: contact created, welcome email sent', async () => {
    const n = calls.length;
    const r = await post('/api/subscribe', { email: '  New.Person@Example.com ', company: '' });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    const c = since(n);
    assert.deepEqual(c.map((x) => `${x.method} ${x.path}`), ['POST /contacts', 'POST /emails']);
    assert.equal(c[0].auth, 'Bearer re_fake_key_for_e2e');
    assert.deepEqual(c[0].body, { email: 'new.person@example.com', unsubscribed: false, segments: [{ id: 'seg_fake' }] });
    const mail = c[1].body;
    assert.equal(mail.from, 'AKSESS Test <test@example.com>');
    assert.deepEqual(mail.to, ['new.person@example.com']);
    assert.equal(mail.subject, "You're on the AKSESS list");
    assert.equal(mail.reply_to, 'reply@example.com');
    assert.equal(mail.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    const m = /^<(.+)>$/.exec(mail.headers['List-Unsubscribe']);
    assert.ok(m, 'List-Unsubscribe header shape');
    link = m[1];
    assert.ok(link.startsWith(`${DEV}/api/unsubscribe?e=`));
    assert.ok(mail.html.includes(link.replace(/&/g, '&amp;')), 'html has unsubscribe link');
    assert.ok(mail.text.includes(`Unsubscribe: ${link}`), 'text has unsubscribe link');
  });

  await check('honeypot: 200, nothing sent to Resend', async () => {
    const n = calls.length;
    const r = await post('/api/subscribe', { email: 'bot@example.com', company: 'Spam Inc' });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal(since(n).length, 0);
  });

  for (const [label, body] of [['bad email', { email: 'not-an-email' }], ['missing email', {}], ['over 254 chars', { email: `${'a'.repeat(250)}@x.co` }]]) {
    await check(`${label}: 400 Invalid email, nothing sent`, async () => {
      const n = calls.length;
      const r = await post('/api/subscribe', body);
      assert.equal(r.status, 400);
      assert.deepEqual(await r.json(), { error: 'Invalid email' });
      assert.equal(since(n).length, 0);
    });
  }

  await check('existing contact (409): 200, resubscribed, no second welcome email', async () => {
    const n = calls.length;
    const r = await post('/api/subscribe', { email: 'existing@example.com' });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    const c = since(n);
    assert.deepEqual(c.map((x) => `${x.method} ${x.path}`), ['POST /contacts', 'PATCH /contacts/existing%40example.com']);
    assert.deepEqual(c[1].body, { unsubscribed: false });
  });

  const local = () => link.slice(DEV.length);

  await check('unsubscribe GET: pending page, does NOT unsubscribe', async () => {
    const n = calls.length;
    const r = await fetch(DEV + local(), { headers: { Accept: 'text/html' } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    const page = await r.text();
    assert.match(page, /Unsubscribing…/);
    assert.ok(page.includes(JSON.stringify(local())), 'page POSTs back to the same link');
    assert.equal(since(n).length, 0);
  });

  await check('unsubscribe POST (page fetch, Accept json): 200 {ok:true}, contact unsubscribed', async () => {
    const n = calls.length;
    const r = await fetch(DEV + local(), { method: 'POST', headers: { Accept: 'application/json' } });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    const c = since(n);
    assert.deepEqual(c.map((x) => `${x.method} ${x.path}`), ['PATCH /contacts/new.person%40example.com']);
    assert.deepEqual(c[0].body, { unsubscribed: true });
  });

  await check('unsubscribe POST RFC 8058 one-click (form body): 200', async () => {
    const r = await fetch(link.replace(DEV, DEV), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
  });

  await check('unsubscribe POST bad signature: 400', async () => {
    const r = await fetch(DEV + local().slice(0, -3) + 'AAA', { method: 'POST', headers: { Accept: 'application/json' } });
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: 'Invalid link' });
  });

  await check('unsubscribe GET bad link: 400 page', async () => {
    const r = await fetch(DEV + '/api/unsubscribe?e=x&t=y', { headers: { Accept: 'text/html' } });
    assert.equal(r.status, 400);
    assert.match(await r.text(), /This link doesn/);
  });

  await check('unsubscribe PUT: 405 with Allow: GET, POST', async () => {
    const r = await fetch(DEV + local(), { method: 'PUT' });
    assert.equal(r.status, 405);
    assert.equal(r.headers.get('allow'), 'GET, POST');
  });

  await check('no request ever left for a non-mock host', async () => {
    assert.ok(!/api\.resend\.com/.test(devLog), 'wrangler log mentions api.resend.com');
  });
} catch (err) {
  failed++;
  console.error(err.message);
} finally {
  stop();
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exitCode = failed ? 1 : 0;
