// Email templates.
//
// Email HTML is not web HTML: no flexbox/grid, no <style> reliability, no web
// fonts, no CSS variables. Everything here is table-based with inline styles and
// a system font stack, which is what actually renders in Gmail/Outlook/Apple Mail.
// Keep it that way when editing.
//
// Format follows the "letter from the founder" pattern rather than a designed
// marketing template: light background, no hero headline, no CTA button, inline
// underlined links, signed off by a person. Plain and personal outperforms
// designed-and-branded for this kind of list, and it renders identically everywhere.
//
// Every template returns { subject, html, text }. The text part isn't optional —
// sending HTML-only is a strong spam signal and some clients show nothing else.

const PAGE = '#e9e9e9';      // light grey page behind the card
const CARD = '#ffffff';
const INK = '#1a1a1a';       // body text
const SOFT = '#6b6b6b';      // footer / secondary
const RULE = '#e2e2e2';
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const SITE = 'https://buildwithsona.com';

// CAN-SPAM (US) and most equivalents require a real physical postal address in
// every commercial email. Set MAIL_FROM_ADDRESS in the environment to your
// registered business address — the fallback below is deliberately obvious so an
// unset value can't quietly ship as though it were real.
const POSTAL_ADDRESS = process.env.MAIL_FROM_ADDRESS || '[SET MAIL_FROM_ADDRESS]';
const LEGAL_NAME = process.env.MAIL_LEGAL_NAME || 'Sona';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function p(content, extra = '') {
  return `<p style="margin:0 0 20px 0;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK};${extra}">${content}</p>`;
}

function link(href, label) {
  return `<a href="${esc(href)}" style="color:${INK};text-decoration:underline;">${esc(label)}</a>`;
}

/**
 * Welcome / confirmation email for a new subscriber.
 * @param {{ email: string, unsubscribeUrl?: string }} opts
 */
export function welcomeEmail({ email, unsubscribeUrl } = {}) {
  const subject = "You're on the list";
  const preheader = "What Sona does, and what happens next.";

  // A working opt-out is legally required. mailto: is a legitimate mechanism and
  // works today; swap in a one-click endpoint when there is one.
  const unsub = unsubscribeUrl
    || `mailto:hello@buildwithsona.com?subject=${encodeURIComponent('Unsubscribe')}&body=${encodeURIComponent('Please unsubscribe ' + (email || '') + ' from the Sona list.')}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
  <!-- preheader: shown in the inbox preview, hidden in the body -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${esc(preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:32px 12px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${CARD};border-radius:12px;">
          <tr>
            <td style="padding:36px 40px 40px 40px;">

              <!-- wordmark, top-left -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;">
                <tr>
                  <td style="font-family:${FONT};font-size:24px;font-weight:700;color:#8a8a8a;letter-spacing:-0.5px;">
                    Sona
                  </td>
                </tr>
              </table>

              ${p("Thanks for subscribing — you're on the list.")}

              ${p("Sona is in beta and I'm onboarding people in small batches, so it may be a little while before your invite lands. I'd rather it work properly than arrive early.")}

              ${p("In the meantime, here's what it actually does.")}

              ${p("It finds posts that genuinely outperformed their own creator's baseline — not just whatever got the most views — then breaks down the mechanism that made each one work: the hook, the tension that stops the scroll, and the reusable pattern underneath.")}

              ${p("Then it hands you that pattern. <strong style=\"font-weight:600;\">You write the post.</strong> Nothing in Sona writes it for you, and that's deliberate.")}

              ${p(`You can see what's working right now at ${link(SITE, 'buildwithsona.com')}.`)}

              ${p("— David")}

              <!-- footer -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 0 0;">
                <tr><td style="border-top:1px solid ${RULE};padding:0;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td style="padding:18px 0 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${SOFT};">
                    You are receiving this email because you opted in to receive updates from ${esc(LEGAL_NAME)}.<br>
                    ${esc(POSTAL_ADDRESS)}<br>
                    <a href="${esc(unsub)}" style="color:${SOFT};text-decoration:underline;font-weight:600;">Unsubscribe</a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Thanks for subscribing — you're on the list.

Sona is in beta and I'm onboarding people in small batches, so it may be a
little while before your invite lands. I'd rather it work properly than arrive early.

In the meantime, here's what it actually does.

It finds posts that genuinely outperformed their own creator's baseline — not
just whatever got the most views — then breaks down the mechanism that made each
one work: the hook, the tension that stops the scroll, and the reusable pattern
underneath.

Then it hands you that pattern. You write the post. Nothing in Sona writes it
for you, and that's deliberate.

You can see what's working right now at ${SITE}

— David

—
You are receiving this email because you opted in to receive updates from ${LEGAL_NAME}.
${POSTAL_ADDRESS}
Unsubscribe: ${unsub}`;

  return { subject, html, text };
}
