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

/* ──────────────────────────────────────────────────────────────────────────
 * Broadcast / newsletter
 *
 * Issues are composed from blocks rather than hand-written HTML, because email
 * HTML is unforgiving: tables for layout, inline styles only, no flexbox or
 * grid, and Outlook ignores most of what a browser accepts. Writing that by
 * hand once per issue is how templates drift and how a broken send happens.
 *
 *   broadcastEmail({
 *     subject: 'Stop guessing. Copy what already works.',
 *     preheader: 'The 3-part skeleton under every post that hits.',
 *     title: ['Stop Guessing.', 'Copy What Already Works.'],
 *     blocks: [
 *       B.para('Most creators lose reach for one dumb reason…'),
 *       B.lead("Here's the fix. Stop inventing. Start decoding."),
 *       B.list(['A hook that creates tension', 'A middle that stacks…']),
 *       B.label('Theirs:', '“I quit my $200K job to sell candles…”'),
 *       B.para('Skeleton = status reversal + insider promise.'),
 *     ],
 *     cta: { label: 'Check Sona', href: SITE },
 *   })
 * ────────────────────────────────────────────────────────────────────────── */

const DARK = '#111111';        // footer panel
const DARK_INK = '#f2f2f2';
const DARK_SOFT = '#9a9a9a';

/** Content blocks. Each returns a table-row-safe HTML string. */
export const B = {
  para: (html) => p(html),
  /** A bolded line that carries the turn in the argument. */
  lead: (html) => p(`<strong>${html}</strong>`),
  /** Ordered list. Uses a table, not <ol> — Outlook's list indentation is unreliable. */
  list: (items) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
      ${items.map((it, i) => `
      <tr>
        <td valign="top" style="padding:0 10px 12px 4px;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK};">${i + 1}.</td>
        <td valign="top" style="padding:0 0 12px 0;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK};">${it}</td>
      </tr>`).join('')}
    </table>`,
  /** "Theirs: …" — a bold label followed by an example. */
  label: (label, html) => p(`<strong>${esc(label)}</strong> ${html}`),
  rule: () => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tr><td style="border-top:1px solid ${RULE};font-size:0;line-height:0;">&nbsp;</td></tr></table>`,
  space: (px = 12) => `<div style="height:${px}px;line-height:${px}px;font-size:0;">&nbsp;</div>`,
};

/**
 * @param {{subject:string, preheader?:string, title:string[]|string,
 *          blocks:string[], cta?:{label:string,href:string},
 *          signoff?:string, unsubscribeUrl?:string, text?:string}} opts
 */
export function broadcastEmail(opts = {}) {
  const {
    subject = '', preheader = '', title = [], blocks = [],
    cta = null, signoff = 'Talk soon,\nDavid from Sona', unsubscribeUrl,
  } = opts;

  const unsub = unsubscribeUrl
    || `mailto:hello@buildwithsona.com?subject=${encodeURIComponent('Unsubscribe')}`;

  const lines = Array.isArray(title) ? title : [title];
  const heading = lines.map(esc).join('<br>');

  const button = cta ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:34px auto 8px auto;">
        <tr>
          <td align="center" bgcolor="${INK}" style="border-radius:6px;">
            <a href="${esc(cta.href)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${esc(cta.label)}</a>
          </td>
        </tr>
      </table>` : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${CARD};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${esc(preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CARD};margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

          <tr><td style="padding:28px 32px 0 32px;">
            <span style="font-family:${FONT};font-size:15px;font-weight:700;color:${INK};letter-spacing:-0.3px;">Sona</span>
          </td></tr>

          <tr><td style="padding:22px 32px 0 32px;">
            <h1 style="margin:0 0 22px 0;font-family:${FONT};font-size:30px;line-height:1.22;font-weight:800;color:${INK};letter-spacing:-0.9px;">${heading}</h1>
            ${blocks.join('\n            ')}
            ${button}
          </td></tr>

          <tr><td style="padding:26px 32px 34px 32px;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK};white-space:pre-line;">${esc(signoff)}</td></tr>

          <!-- Dark footer. Colours are hardcoded rather than inherited: a client
               in dark mode will happily invert a light panel and leave the text
               unreadable, so this panel states both sides explicitly. -->
          <tr><td style="padding:0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${DARK}" style="background:${DARK};">
              <tr><td style="padding:30px 32px 34px 32px;">
                <div style="font-family:${FONT};font-size:15px;font-weight:700;color:${DARK_INK};margin:0 0 20px 0;">Sona</div>
                <div style="font-family:${FONT};font-size:13px;line-height:1.7;color:${DARK_SOFT};margin:0 0 6px 0;">Questions?</div>
                <div style="font-family:${FONT};font-size:13px;line-height:1.7;color:${DARK_SOFT};margin:0 0 22px 0;">I read every reply and comment.</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;">
                  <tr><td style="border-top:1px solid #333333;font-size:0;line-height:0;">&nbsp;</td></tr>
                </table>
                <div style="font-family:${FONT};font-size:12px;line-height:1.7;color:${DARK_SOFT};">
                  ${esc(LEGAL_NAME)}<br>
                  <a href="${SITE}" style="color:${DARK_SOFT};text-decoration:none;">buildwithsona.com</a><br>
                  ${esc(POSTAL_ADDRESS)}
                </div>
                <div style="font-family:${FONT};font-size:12px;line-height:1.7;color:${DARK_SOFT};margin:14px 0 0 0;">
                  No longer want to receive these emails?
                  <a href="${esc(unsub)}" style="color:${DARK_INK};text-decoration:underline;font-weight:600;">Unsubscribe</a>.
                </div>
              </td></tr>
            </table>
          </td></tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Every send needs a plain-text part. Without one, spam filters score the
  // message worse and text-only clients show nothing at all.
  const text = opts.text || [
    lines.join('\n'),
    '',
    blocks.map((b) => b.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n'),
    '',
    cta ? `${cta.label}: ${cta.href}` : '',
    '',
    signoff,
    '',
    '—',
    `${LEGAL_NAME} · ${SITE}`,
    POSTAL_ADDRESS,
    `Unsubscribe: ${unsub}`,
  ].filter((x) => x !== null).join('\n');

  return { subject, html, text };
}
