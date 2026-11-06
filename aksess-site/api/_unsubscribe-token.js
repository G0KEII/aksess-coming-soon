// Signed one-click unsubscribe links for the welcome email.
// Files starting with "_" inside /api are not exposed as routes by Vercel.
// Environment variables in Vercel:
//   UNSUBSCRIBE_SECRET (required, any long random string; changing it breaks
//                       every unsubscribe link already sent)
//   SITE_URL           (optional, defaults to "https://getaksess.com")

import { createHmac, timingSafeEqual } from 'node:crypto';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const B64URL = /^[A-Za-z0-9_-]+$/;

function secret() {
  return process.env.UNSUBSCRIBE_SECRET || '';
}

export function signEmail(email) {
  const key = secret();
  if (!key) throw new Error('UNSUBSCRIBE_SECRET is not set');
  return createHmac('sha256', key)
    .update(String(email).trim().toLowerCase())
    .digest('base64url');
}

// e = base64url email, t = signature. Returns the email, or null if invalid.
export function verify(e, t) {
  if (!secret() || typeof e !== 'string' || typeof t !== 'string') return null;
  if (!B64URL.test(e) || !B64URL.test(t) || e.length > 400) return null;
  let email;
  try {
    email = Buffer.from(e, 'base64url').toString('utf8').trim().toLowerCase();
  } catch {
    return null;
  }
  if (!EMAIL.test(email) || email.length > 254) return null;

  const expected = Buffer.from(signEmail(email));
  const given = Buffer.from(t);
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? email : null;
}

export function unsubscribeUrl(email) {
  const base = (process.env.SITE_URL || 'https://getaksess.com').replace(/\/+$/, '');
  const normal = String(email).trim().toLowerCase();
  const e = Buffer.from(normal, 'utf8').toString('base64url');
  return `${base}/api/unsubscribe?e=${e}&t=${signEmail(normal)}`;
}

// RFC 8058 one-click unsubscribe headers (Gmail and Yahoo bulk sender rules).
export function unsubscribeHeaders(email) {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl(email)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
