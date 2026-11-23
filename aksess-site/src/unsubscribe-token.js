// Signed one-click unsubscribe links for the welcome email.
// Web Crypto port of legacy-vercel/api/_unsubscribe-token.js. Tokens are
// byte-identical to the old node:crypto version (see test/token.test.mjs),
// so links already sent keep working.
// Config (Worker env):
//   UNSUBSCRIBE_SECRET (required, any long random string; changing it breaks
//                       every unsubscribe link already sent)
//   SITE_URL           (optional, defaults to "https://getaksess.com")

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const utf8 = new TextEncoder();

// Same output as Node's Buffer#toString('base64url'): no padding.
function toBase64url(bytes) {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += ALPHABET[(value >> bits) & 63];
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(value << (6 - bits)) & 63];
  return out;
}

// Same output as Node's Buffer.from(s, 'base64url') for strings that already
// passed the B64URL check: whole bytes only, leftover bits are dropped.
function fromBase64url(s) {
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const ch of s) {
    value = (value << 6) | ALPHABET.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 255);
    }
    value &= (1 << bits) - 1;
  }
  return new Uint8Array(bytes);
}

function secret(env) {
  return (env && env.UNSUBSCRIBE_SECRET) || '';
}

function sameString(a, b) {
  if (a.length !== b.length) return false;
  const x = utf8.encode(a);
  const y = utf8.encode(b);
  if (x.length !== y.length) return false;
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(x, y);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function signEmail(email, env) {
  const key = secret(env);
  if (!key) throw new Error('UNSUBSCRIBE_SECRET is not set');
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    utf8.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, utf8.encode(String(email).trim().toLowerCase()));
  return toBase64url(new Uint8Array(mac));
}

// e = base64url email, t = signature. Returns the email, or null if invalid.
export async function verify(e, t, env) {
  if (!secret(env) || typeof e !== 'string' || typeof t !== 'string') return null;
  if (!B64URL.test(e) || !B64URL.test(t) || e.length > 400) return null;
  const email = new TextDecoder().decode(fromBase64url(e)).trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return null;

  const expected = await signEmail(email, env);
  return sameString(t, expected) ? email : null;
}

export async function unsubscribeUrl(email, env) {
  const base = ((env && env.SITE_URL) || 'https://getaksess.com').replace(/\/+$/, '');
  const normal = String(email).trim().toLowerCase();
  const e = toBase64url(utf8.encode(normal));
  return `${base}/api/unsubscribe?e=${e}&t=${await signEmail(normal, env)}`;
}

// RFC 8058 one-click unsubscribe headers (Gmail and Yahoo bulk sender rules).
export async function unsubscribeHeaders(email, env) {
  return {
    'List-Unsubscribe': `<${await unsubscribeUrl(email, env)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
