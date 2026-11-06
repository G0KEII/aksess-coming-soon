// Vercel serverless function: adds a waitlist email to Resend Contacts,
// tagged with the AKSESS waitlist segment.
// Environment variables in Vercel:
//   RESEND_API_KEY     (required, Full access key)
//   RESEND_SEGMENT_ID  (recommended, keeps AKSESS signups apart from other lists)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const contact = { email, unsubscribed: false };
  if (process.env.RESEND_SEGMENT_ID) {
    contact.segments = [{ id: process.env.RESEND_SEGMENT_ID }];
  }

  const response = await fetch('https://api.resend.com/contacts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(contact),
  });

  // 409: already on the list, which is fine for a waitlist.
  if (!response.ok && response.status !== 409) {
    console.error('Resend error', response.status, await response.text());
    return res.status(502).json({ error: 'Could not save email' });
  }

  return res.status(200).json({ ok: true });
}
