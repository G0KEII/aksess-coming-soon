// Vercel serverless function: adds a waitlist email to Resend Contacts,
// tagged with the AKSESS waitlist segment, then sends a welcome email.
// Environment variables in Vercel:
//   RESEND_API_KEY     (required, Full access key)
//   RESEND_SEGMENT_ID  (recommended, keeps AKSESS signups apart from other lists)
//   RESEND_FROM        (optional, defaults to "AKSESS <hello@getaksess.com>";
//                       must be on a domain verified in Resend)
//   RESEND_REPLY_TO    (optional, inbox that receives replies to the welcome email)

import { subject, html, text } from './_welcome-email.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resend(path, body) {
  return fetch(`https://api.resend.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Hidden "company" field: people never see it, bots fill it in.
  if (req.body && req.body.company) {
    return res.status(200).json({ ok: true });
  }

  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const contact = { email, unsubscribed: false };
  if (process.env.RESEND_SEGMENT_ID) {
    contact.segments = [{ id: process.env.RESEND_SEGMENT_ID }];
  }

  const created = await resend('/contacts', contact);

  // 409: already on the list. Say yes, but don't send the welcome email again.
  if (created.status === 409) {
    return res.status(200).json({ ok: true });
  }
  if (!created.ok) {
    console.error('Resend error', created.status, await created.text());
    return res.status(502).json({ error: 'Could not save email' });
  }

  // The signup already succeeded, so a failed welcome email is only logged.
  const welcome = {
    from: process.env.RESEND_FROM || 'AKSESS <hello@getaksess.com>',
    to: [email],
    subject,
    html: html(),
    text: text(),
  };
  if (process.env.RESEND_REPLY_TO) welcome.reply_to = process.env.RESEND_REPLY_TO;

  const sent = await resend('/emails', welcome);
  if (!sent.ok) {
    console.error('Welcome email error', sent.status, await sent.text());
  }

  return res.status(200).json({ ok: true });
}
