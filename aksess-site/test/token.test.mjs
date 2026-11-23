// The Web Crypto token code must produce exactly what the old node:crypto code
// produced, or unsubscribe links already sent stop working.
// Runs the old Vercel module side by side with the new one. Fake secret only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as legacy from '../legacy-vercel/api/_unsubscribe-token.js';
import * as current from '../src/unsubscribe-token.js';

const SECRETS = ['test-secret-not-real', 'another fake secret ✓ with unicode', 'x'];
const EMAILS = [
  'ada@example.com',
  '  Mixed.Case+Tag@Example.COM ',
  'a@b.co', // short: base64url length % 4 != 0
  'ab@b.co',
  'abc@b.co',
  'tèst.ünicode@exämple.ng',
  `${'l'.repeat(240)}@example.com`,
];

function withLegacyEnv(env, fn) {
  const saved = { s: process.env.UNSUBSCRIBE_SECRET, u: process.env.SITE_URL };
  process.env.UNSUBSCRIBE_SECRET = env.UNSUBSCRIBE_SECRET;
  if (env.SITE_URL === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = env.SITE_URL;
  try {
    return fn();
  } finally {
    process.env.UNSUBSCRIBE_SECRET = saved.s;
    if (saved.u === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = saved.u;
    if (saved.s === undefined) delete process.env.UNSUBSCRIBE_SECRET;
  }
}

test('fixed sample: new token equals old token', async () => {
  const env = { UNSUBSCRIBE_SECRET: 'test-secret-not-real' };
  const email = 'sample@example.com';
  const oldToken = withLegacyEnv(env, () => legacy.signEmail(email));
  const newToken = await current.signEmail(email, env);
  assert.equal(newToken, oldToken);
  assert.match(newToken, /^[A-Za-z0-9_-]{43}$/);
});

test('signEmail, unsubscribeUrl and headers match for many inputs', async () => {
  for (const secret of SECRETS) {
    for (const SITE_URL of [undefined, 'https://getaksess.com/', 'http://localhost:8787']) {
      const env = { UNSUBSCRIBE_SECRET: secret, SITE_URL };
      for (const email of EMAILS) {
        const old = withLegacyEnv(env, () => ({
          token: legacy.signEmail(email),
          url: legacy.unsubscribeUrl(email),
          headers: legacy.unsubscribeHeaders(email),
        }));
        assert.equal(await current.signEmail(email, env), old.token, `token ${email}`);
        assert.equal(await current.unsubscribeUrl(email, env), old.url, `url ${email}`);
        assert.deepEqual(await current.unsubscribeHeaders(email, env), old.headers, `headers ${email}`);
      }
    }
  }
});

test('verify accepts links made by the old code and rejects the same things', async () => {
  const env = { UNSUBSCRIBE_SECRET: 'test-secret-not-real' };
  const cases = [];
  for (const email of EMAILS) {
    const url = new URL(withLegacyEnv(env, () => legacy.unsubscribeUrl(email)));
    const e = url.searchParams.get('e');
    const t = url.searchParams.get('t');
    cases.push([e, t], [e, t.slice(0, -1)], [e, t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A')], [e + 'A', t], [e.slice(0, -1), t]);
  }
  cases.push(['', ''], ['@@@', 'x'], ['YQ', 'x'], [undefined, 'x'], ['YUBiLmNv', undefined], ['A'.repeat(401), 'x']);

  for (const [e, t] of cases) {
    const old = withLegacyEnv(env, () => legacy.verify(e, t));
    assert.equal(await current.verify(e, t, env), old, `verify(${e}, ${t})`);
  }
  // Valid old links really are accepted (not just "both null").
  const url = new URL(withLegacyEnv(env, () => legacy.unsubscribeUrl('Ada@Example.com')));
  assert.equal(await current.verify(url.searchParams.get('e'), url.searchParams.get('t'), env), 'ada@example.com');
});

test('no secret: verify returns null and signing throws, like before', async () => {
  assert.equal(await current.verify('YUBiLmNv', 'x', {}), null);
  await assert.rejects(() => current.signEmail('a@b.co', {}), /UNSUBSCRIBE_SECRET is not set/);
});
