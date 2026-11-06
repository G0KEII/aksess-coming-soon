// Welcome email sent once, right after someone joins the waitlist.
// Files starting with "_" inside /api are not exposed as routes by Vercel.
// Styles are inline and fonts fall back to Georgia / Arial, because most
// email clients ignore web fonts and <style> blocks.

export const subject = 'AKSESS Granted';

export function text() {
  return [
    "You're on the list.",
    '',
    "Thanks for signing up for AKSESS. We've saved your spot.",
    '',
    'What happens next:',
    '- We email you once, the day AKSESS opens.',
    '- Nothing in between. No spam, no newsletter.',
    '',
    "What you'll be able to do:",
    "- Discover: see concerts, parties and shows happening around you.",
    '- Ticketing: buy in a few taps and keep your ticket on your phone.',
    '- Check-in: walk straight in. Your ticket gets scanned at the door.',
    '',
    'Run events? Reply to this email and tell us about them. Organisers can sell tickets, check guests in and get paid out through Paystack.',
    '',
    'Be where it happens.',
    'AKSESS, Lagos',
    '',
    "You got this email because this address was entered at getaksess.com. Not you? Ignore it and you won't hear from us.",
  ].join('\n');
}

export function html() {
  const teal = '#006B68';
  const deep = '#00403E';
  const coral = '#FF735E';
  const mint = '#C8E6DF';
  const warm = '#F4F5EF';
  const muted = '#4C6664';
  const serif = "Georgia,'Times New Roman',serif";
  const sans = "Arial,Helvetica,sans-serif";
  const mono = "'Courier New',Courier,monospace";

  const row = (label, body) => `
    <tr>
      <td style="padding:14px 0;border-top:1px solid #DCE3DF;">
        <div style="font-family:${mono};font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${teal};">${label}</div>
        <div style="font-family:${sans};font-size:15px;line-height:22px;color:#0E2A29;padding-top:4px;">${body}</div>
      </td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${warm};">
<div style="display:none;max-height:0;overflow:hidden;">We've saved your spot. One email when AKSESS opens, nothing else.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${warm};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <tr>
          <td style="padding:0 4px 20px;font-family:${sans};font-weight:bold;font-size:14px;letter-spacing:4px;color:${deep};">AKSESS</td>
        </tr>

        <tr>
          <td style="background:${deep};border-radius:20px;padding:40px 32px;">
            <div style="font-family:${mono};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${mint};">Waitlist confirmed</div>
            <h1 style="margin:14px 0 0;font-family:${serif};font-weight:normal;font-size:38px;line-height:42px;color:${warm};">You're on<br><em style="color:${mint};">the list.</em></h1>
            <p style="margin:18px 0 0;font-family:${sans};font-size:16px;line-height:24px;color:${mint};">Thanks for signing up for AKSESS. We've saved your spot.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;background:#FFFFFF;border-radius:12px;">
              <tr>
                <td style="padding:14px 18px;border-right:2px dashed #DCE3DF;">
                  <div style="font-family:${sans};font-weight:bold;font-size:12px;letter-spacing:3px;color:${deep};">AKSESS</div>
                  <div style="font-family:${serif};font-size:18px;color:${deep};padding-top:4px;">Your spot is saved</div>
                </td>
                <td style="padding:14px 18px;">
                  <div style="font-family:${mono};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${muted};">Status</div>
                  <div style="font-family:${mono};font-size:13px;font-weight:bold;color:${deep};padding-top:4px;">Waitlist</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:32px 4px 0;">
            <div style="font-family:${serif};font-size:22px;color:${deep};padding-bottom:6px;">What happens next</div>
            <p style="margin:0;font-family:${sans};font-size:15px;line-height:23px;color:#0E2A29;">We email you once, the day AKSESS opens. Nothing in between: no spam, no newsletter.</p>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 4px 0;">
            <div style="font-family:${serif};font-size:22px;color:${deep};padding-bottom:6px;">What you'll be able to do</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${row('Discover', 'See concerts, parties and shows happening around you.')}
              ${row('Ticketing', 'Buy in a few taps and keep your ticket on your phone.')}
              ${row('Check-in', 'Walk straight in. Your ticket gets scanned at the door.')}
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 4px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${mint};border-radius:14px;">
              <tr>
                <td style="padding:20px 22px;font-family:${sans};font-size:15px;line-height:23px;color:${deep};">
                  <strong>Run events?</strong> Reply to this email and tell us about them. Organisers can sell tickets, check guests in and get paid out through Paystack.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 4px 0;font-family:${serif};font-style:italic;font-size:20px;color:${teal};">Be where it happens.</td>
        </tr>
        <tr>
          <td style="padding:24px 4px 0;border-bottom:3px solid ${coral};"></td>
        </tr>
        <tr>
          <td style="padding:16px 4px 0;font-family:${sans};font-size:12px;line-height:18px;color:${muted};">
            You got this email because this address was entered at getaksess.com. Not you? Ignore it and you won't hear from us.<br>
            AKSESS, Lagos, Nigeria
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
