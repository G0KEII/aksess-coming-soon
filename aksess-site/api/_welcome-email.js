// Welcome email sent once, right after someone joins the waitlist.
// Files starting with "_" inside /api are not exposed as routes by Vercel.
// Table layout with inline styles and system fonts, so it holds up in Gmail,
// Apple Mail and Outlook. The small <style> block only adds mobile tweaks
// (tighter padding, full-width button); the email works without it.
// Both builders take { unsubscribeUrl }. Never send without one.
// html() also takes an optional heroUrl, used by the local preview.

const SUPPORT = 'support@getaksess.com';
const SITE = 'https://getaksess.com';
const HERO = `${SITE}/email/hero.jpg`;

const SHARE_TEXT =
  "I just joined the AKSESS waitlist. It's a new way to find and get into events in Nigeria. Join here: https://getaksess.com";
const SHARE_URL = `https://wa.me/?text=${encodeURIComponent(SHARE_TEXT)}`;

const HEADLINE = "You're on the list 🎟️";
const BODY =
  "AKSESS is a new way to find events in Nigeria, buy tickets and get checked in at the door. We'll email you once, when doors\u00A0open.";
const ORGANISERS = 'Organising events? Reply to this email and tell us about it.';
const REASON = "You're getting this because you joined the AKSESS waitlist at getaksess.com.";
const COPYRIGHT = '© 2026 AKSESS · Lagos, Nigeria';

// Escapes a value for use inside an HTML attribute or text.
const esc = (v) =>
  String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const subject = "You're on the AKSESS list";

export function text({ unsubscribeUrl } = {}) {
  return [
    HEADLINE,
    '',
    BODY,
    '',
    `Tell a friend: ${SHARE_URL}`,
    '',
    ORGANISERS,
    '',
    '---',
    `Questions? Write to ${SUPPORT}`,
    REASON,
    `Unsubscribe: ${unsubscribeUrl}`,
    COPYRIGHT,
    '',
    'getaksess.com',
  ].join('\n');
}

export function html({ unsubscribeUrl, heroUrl = HERO } = {}) {
  const teal = '#006B68';
  const deep = '#00403E';
  const warm = '#F4F5EF';
  const muted = '#5B6F6D';
  const line = '#DCE3DF';
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const link = `color:${teal};text-decoration:underline;`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<style>
  @media only screen and (max-width:480px) {
    .outer { padding:16px !important; }
    .px { padding-left:24px !important; padding-right:24px !important; }
    .btn { width:100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${warm};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">We'll email you once, when doors open.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${warm};">
  <tr>
    <td class="outer" align="center" style="padding:32px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;">

        <tr>
          <td bgcolor="${deep}" style="background:${deep};border-radius:16px 16px 0 0;line-height:0;font-size:0;">
            <img src="${esc(heroUrl)}" width="560" alt="AKSESS" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:16px 16px 0 0;font-family:${font};font-size:24px;font-weight:bold;letter-spacing:6px;line-height:28px;color:#FFFFFF;text-align:center;">
          </td>
        </tr>

        <tr>
          <td class="px" align="center" style="padding:40px 64px 0;font-family:${font};font-size:22px;line-height:30px;font-weight:600;color:${deep};">${esc(HEADLINE)}</td>
        </tr>
        <tr>
          <td class="px" align="center" style="padding:10px 64px 0;font-family:${font};font-size:15px;line-height:23px;color:${muted};">${esc(BODY)}</td>
        </tr>

        <tr>
          <td class="px" align="center" style="padding:36px 0 0;">
            <table role="presentation" class="btn" width="60%" cellpadding="0" cellspacing="0" border="0" style="width:60%;">
              <tr>
                <td align="center" bgcolor="${teal}" style="background:${teal};border-radius:8px;">
                  <a href="${esc(SHARE_URL)}" style="display:block;padding:15px 20px;font-family:${font};font-size:15px;line-height:18px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">Tell a friend</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="px" align="center" style="padding:16px 56px 0;font-family:${font};font-size:13px;line-height:20px;color:${muted};">${esc(ORGANISERS)}</td>
        </tr>

        <tr>
          <td class="px" style="padding:40px 48px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="border-top:1px dashed ${line};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="px" align="center" style="padding:32px 48px 0;font-family:${font};font-size:13px;line-height:21px;color:${muted};">
            Questions? Write to <a href="mailto:${SUPPORT}" style="${link}">${SUPPORT}</a><br>
            ${esc(REASON)}<br>
            <a href="${esc(unsubscribeUrl)}" style="${link}">Unsubscribe</a><br>
            ${esc(COPYRIGHT)}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 24px 44px;font-family:${font};font-size:13px;line-height:20px;">
            <a href="${SITE}" style="color:${muted};text-decoration:underline;">getaksess.com</a>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
