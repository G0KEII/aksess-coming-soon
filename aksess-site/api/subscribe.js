// Vercel serverless function: adds a waitlist email to the Resend audience.
// Needs two environment variables in Vercel: RESEND_API_KEY and RESEND_AUDIENCE_ID.

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

  const response = await fetch(
    `https://api.resend.com/audiences/${process.env.RESEND_AUDIENCE_ID}/contacts`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, unsubscribed: false }),
    }
  );

  if (!response.ok) {
    console.error('Resend error', response.status, await response.text());
    return res.status(502).json({ error: 'Could not save email' });
  }

  return res.status(200).json({ ok: true });
}
