// Runs each request through the old Vercel handlers and the new Worker with
// the same mocked fetch, and checks they answer the same and make the same
// Resend calls. No network: globalThis.fetch is replaced. Fake values only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import oldSubscribe from '../legacy-vercel/api/subscribe.js';
import oldUnsubscribe from '../legacy-vercel/api/unsubscribe.js';
import { unsubscribeUrl as oldUnsubscribeUrl } from '../legacy-vercel/api/_unsubscribe-token.js';
import worker from '../src/worker.js';

const BASE_ENV = {
  RESEND_API_KEY: 're_fake_key_for_tests',
  UNSUBSCRIBE_SECRET: 'fake-unsubscribe-secret',
};

// --- mocked Resend ---
let calls = [];
let reply = () => new Response('{}', { status: 200 });
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body && JSON.parse(init.body) });
  return reply(String(url), init);
};

function setEnv(env) {
  for (const k of ['RESEND_API_KEY', 'RESEND_SEGMENT_ID', 'RESEND_FROM', 'RESEND_REPLY_TO', 'UNSUBSCRIBE_SECRET', 'SITE_URL']) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
}

// --- old handler with fake Vercel req/res ---
async function runOld(handler, { method, url, headers = {}, body }, env) {
  setEnv(env);
  const u = new URL(url, 'https://getaksess.com');
  const query = {};
  for (const [k, v] of u.searchParams) query[k] = k in query ? [].concat(query[k], v) : v;
  const req = { method, query, body, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])) };
  const out = { status: 200, headers: {}, body: '' };
  const res = {
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; return res; },
    status(s) { out.status = s; return res; },
    json(o) { out.headers['content-type'] ??= 'application/json; charset=utf-8'; out.body = JSON.stringify(o); return res; },
    send(s) { out.body = method === 'HEAD' ? '' : s; return res; },
  };
  calls = [];
  await handler(req, res);
  return { ...out, calls };
}

// --- new Worker ---
async function runNew({ method, url, headers = {}, body }, env) {
  setEnv({}); // make sure the Worker only reads its env argument
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  calls = [];
  const r = await worker.fetch(new Request(new URL(url, 'https://getaksess.com'), init), env, {});
  const headersOut = {};
  for (const k of ['content-type', 'allow', 'cache-control', 'x-robots-tag', 'referrer-policy']) {
    if (r.headers.has(k)) headersOut[k] = r.headers.get(k);
  }
  return { status: r.status, headers: headersOut, body: await r.text(), calls };
}

async function same(name, request, env, replyFn) {
  reply = replyFn || (() => new Response('{}', { status: 200 }));
  const a = await runOld(request.handler, request, env);
  const b = await runNew(request, env);
  assert.equal(b.status, a.status, `${name}: status`);
  assert.deepEqual(b.headers, a.headers, `${name}: headers`);
  assert.equal(b.body, a.body, `${name}: body`);
  assert.deepEqual(b.calls, a.calls, `${name}: Resend calls`);
  return b;
}

const sub = (body, method = 'POST') => ({ handler: oldSubscribe, method, url: '/api/subscribe', body });

test('subscribe: same responses and Resend calls', async () => {
  await same('GET is 405', sub(undefined, 'GET'), BASE_ENV);
  await same('honeypot', sub({ email: 'bot@example.com', company: 'Acme' }), BASE_ENV);
  await same('bad email', sub({ email: 'not-an-email' }), BASE_ENV);
  await same('missing email', sub({}), BASE_ENV);
  await same('too long', sub({ email: `${'a'.repeat(250)}@x.co` }), BASE_ENV);

  const happy = await same('happy path', sub({ email: '  New@Example.com ' }), BASE_ENV, (url) =>
    new Response('{"id":"x"}', { status: url.endsWith('/contacts') ? 201 : 200 }));
  assert.equal(happy.calls.length, 2);
  assert.equal(happy.calls[1].body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');

  await same('happy path, all options', sub({ email: 'new@example.com' }), {
    ...BASE_ENV, RESEND_SEGMENT_ID: 'seg_fake', RESEND_FROM: 'Test <t@example.com>',
    RESEND_REPLY_TO: 'reply@example.com', SITE_URL: 'http://localhost:8787/',
  });

  const existing = await same('409 existing contact', sub({ email: 'old@example.com' }), BASE_ENV, (url, init) =>
    new Response('{}', { status: init.method === 'POST' ? 409 : 200 }));
  assert.deepEqual(existing.calls.map((c) => c.method), ['POST', 'PATCH']);

  await same('409, resubscribe fails', sub({ email: 'old@example.com' }), BASE_ENV, (url, init) =>
    new Response('nope', { status: init.method === 'POST' ? 409 : 500 }));
  await same('Resend down is 502', sub({ email: 'new@example.com' }), BASE_ENV, () => new Response('down', { status: 500 }));
  await same('no UNSUBSCRIBE_SECRET: saved, no email', sub({ email: 'new@example.com' }), { RESEND_API_KEY: 'k' });
  await same('welcome email fails: still ok', sub({ email: 'new@example.com' }), BASE_ENV, (url) =>
    new Response('{}', { status: url.endsWith('/emails') ? 422 : 200 }));
});

test('unsubscribe: same responses and Resend calls', async () => {
  setEnv(BASE_ENV);
  const link = new URL(oldUnsubscribeUrl('ada@example.com'));
  const path = link.pathname + link.search;
  const un = (method, url, headers) => ({ handler: oldUnsubscribe, method, url, headers });
  const html = { Accept: 'text/html,application/xhtml+xml' };
  const api = { Accept: 'application/json' };

  const page = await same('GET valid shows pending page', un('GET', path, html), BASE_ENV);
  assert.match(page.body, /Unsubscribing…/);
  assert.equal(page.calls.length, 0, 'GET must never unsubscribe');
  await same('HEAD valid', un('HEAD', path, html), BASE_ENV);
  await same('GET invalid', un('GET', path.slice(0, -2), html), BASE_ENV);
  await same('GET no params', un('GET', '/api/unsubscribe', html), BASE_ENV);
  await same('GET repeated param', un('GET', `${path}&e=x`, html), BASE_ENV);
  const post = await same('POST valid (fetch from page)', un('POST', path, api), BASE_ENV);
  assert.deepEqual(post.calls[0].body, { unsubscribed: true });
  await same('POST one-click (no Accept)', un('POST', path, {}), BASE_ENV);
  await same('POST from noscript form', un('POST', path, html), BASE_ENV);
  await same('POST invalid', un('POST', path.slice(0, -2), api), BASE_ENV);
  await same('POST contact already gone (404)', un('POST', path, api), BASE_ENV, () => new Response('', { status: 404 }));
  await same('POST Resend error', un('POST', path, api), BASE_ENV, () => new Response('x', { status: 500 }));
  await same('POST fetch throws', un('POST', path, api), BASE_ENV, () => { throw new Error('network'); });
  await same('PUT is 405', un('PUT', path, api), BASE_ENV);
  await same('no secret configured', un('POST', path, api), { RESEND_API_KEY: 'k' });
});

test('unknown /api paths are 404 in the Worker', async () => {
  for (const p of ['/api/welcome-email-preview.html', '/api/_unsubscribe-token.js', '/api/subscribe.js', '/api/']) {
    const r = await worker.fetch(new Request(`https://getaksess.com${p}`), BASE_ENV, {});
    assert.equal(r.status, 404, p);
  }
});
