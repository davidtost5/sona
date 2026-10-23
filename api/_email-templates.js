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
// Sona is not a registered company yet, so the sender CAN-SPAM needs named is
// the person who runs it. Change MAIL_LEGAL_NAME once there is an entity.
const LEGAL_NAME = process.env.MAIL_LEGAL_NAME || 'David Tost (Sona)';

// Senders check this before any commercial send. The placeholder above keeps
// a template from rendering a fake address; this keeps it from being mailed.
export const postalAddressConfigured = () => Boolean((process.env.MAIL_FROM_ADDRESS || '').trim());

// The opt-out every template links to, as a plain mailto: target.
export function unsubscribeMailto(email) {
  return `mailto:hello@buildwithsona.com?subject=${encodeURIComponent('Unsubscribe')}`
    + (email ? `&body=${encodeURIComponent('Please unsubscribe ' + email + ' from the Sona list.')}` : '');
}

// Headers that make Gmail and Apple Mail show their own "Unsubscribe" button.
// Gmail and Yahoo require one on bulk mail. mailto: is the accepted fallback
// until there is a one-click HTTPS endpoint (RFC 8058).
export function unsubscribeHeaders(email) {
  return { 'List-Unsubscribe': `<${unsubscribeMailto(email)}>` };
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function p(content, extra = '') {
  return `<p style="margin:0 0 20px 0;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK};${extra}">${content}</p>`;
}


/* ──────────────────────────────────────────────────────────────────────────
 * Brand layout
 *
 * The designed frame for product email, after Osmo's: a slim header, a dark
 * hero card with small tags, one big headline and the wordmark cropped along
 * its bottom edge, a short body, social icons, two buttons and a small footer.
 *
 * Everything that has to look exact is a PNG in public/email/ (the wordmark
 * strip, the logo mark, the icons): Gmail drops SVG and most CSS, and Outlook
 * ignores border-radius, so those degrade to square corners, never breakage.
 *
 *   brandEmail({
 *     subject, preheader,
 *     tags: ['Password', 'Reset'],
 *     title: ['Password cannot', 'be reset'],
 *     greeting: 'Hi David,',
 *     paragraphs: ['…'],             // trusted HTML, written in code
 *     code: '{{otp_code}}',          // optional one-time code box
 *     note: 'Questions? Reply to this email.',
 *     primary: { label: 'Open Sona', href: SITE + '/app' },
 *     footer: { reason, unsubscribeUrl },   // marketing email only
 *   })
 *
 * Strings are inserted as given, so a Clerk template can pass Handlebars
 * placeholders such as {{app.name}} straight through.
 * ────────────────────────────────────────────────────────────────────────── */

const ASSETS = `${SITE}/email`;
const BRAND = {
  paper: '#ecebe6',     // behind the email
  sheet: '#f6f6f3',     // the email itself
  ink: '#1a1a1a',
  mid: '#55554f',
  soft: '#6b6b64',
  rule: '#e2e1dc',
  hero: '#1a1a1a',
  heroTag: '#2c2c2b',
  heroTagInk: '#cfcfc9',
  green: '#28775c',
  tile: '#e6e5e0',
};
const BRAND_FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const BRAND_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SOCIAL = [
  { name: 'X', href: 'https://x.com/davidtostscale', img: 'x.png' },
  { name: 'LinkedIn', href: 'https://www.linkedin.com/in/davidtost/', img: 'linkedin.png' },
  { name: 'GitHub', href: 'https://github.com/davidtost5/sona', img: 'github.png' },
];

function bulletproofButton({ label, href, bg, color, radius }) {
  return `<td align="center" bgcolor="${bg}" style="border-radius:${radius};background:${bg};">
            <a href="${esc(href)}" style="display:inline-block;padding:15px 26px;font-family:${BRAND_FONT};font-size:17px;font-weight:500;line-height:1;color:${color};text-decoration:none;border-radius:${radius};">${esc(label)}</a>
          </td>`;
}

export function brandEmail(opts = {}) {
  const {
    subject = '', preheader = '', tags = [], title = [], greeting = '',
    paragraphs = [], code = '', note = '', primary = null,
    secondary = { label: 'Website', href: SITE }, footer = null,
  } = opts;
  const lines = (Array.isArray(title) ? title : [title]).map(esc).join('<br>');
  const tagHtml = tags.map((t) => `<span style="display:inline-block;margin:0 2px;padding:5px 10px;border-radius:6px;background:${BRAND.heroTag};font-family:${BRAND_MONO};font-size:12px;line-height:1;color:${BRAND.heroTagInk};">${esc(t)}</span>`).join('');
  const body = (greeting ? [greeting] : []).concat(paragraphs)
    .map((h) => `<p style="margin:0 0 22px 0;font-family:${BRAND_FONT};font-size:18px;line-height:1.6;color:${BRAND.ink};">${h}</p>`).join('\n              ');
  const icons = SOCIAL.map((x) => `<td style="padding:0 5px;">
                  <a href="${esc(x.href)}" style="display:block;width:48px;height:48px;border-radius:24px;background:${BRAND.tile};text-align:center;line-height:0;">
                    <img src="${ASSETS}/${x.img}" width="20" height="20" alt="${esc(x.name)}" style="display:inline-block;margin-top:14px;border:0;">
                  </a>
                </td>`).join('');
  const buttons = [
    secondary && bulletproofButton({ ...secondary, bg: BRAND.ink, color: '#ffffff', radius: '6px' }),
    primary && bulletproofButton({ ...primary, bg: BRAND.green, color: '#ffffff', radius: '999px' }),
  ].filter(Boolean).join('<td style="width:10px;font-size:0;">&nbsp;</td>');
  const legal = footer ? `
          <tr>
            <td style="padding:0 40px 30px 40px;font-family:${BRAND_FONT};font-size:12px;line-height:1.6;color:${BRAND.soft};text-align:center;">
              ${esc(footer.reason || '')}<br>${esc(LEGAL_NAME)}, ${esc(POSTAL_ADDRESS)}<br>
              <a href="${esc(footer.unsubscribeUrl || unsubscribeMailto())}" style="color:${BRAND.soft};text-decoration:underline;">Unsubscribe</a>
            </td>
          </tr>` : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<style>
  @media (max-width: 600px) {
    .px { padding-left: 24px !important; padding-right: 24px !important; }
    .hero-h { font-size: 34px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.paper};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.paper};">
    <tr>
      <td align="center" style="padding:24px 10px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:${BRAND.sheet};border-radius:14px;">

          <!-- header -->
          <tr>
            <td class="px" style="padding:26px 40px;border-bottom:1px solid ${BRAND.rule};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="font-family:${BRAND_FONT};font-size:22px;font-weight:700;letter-spacing:-0.6px;color:${BRAND.ink};">
                  <img src="${ASSETS}/mark.png" width="26" height="26" alt="" style="display:inline-block;vertical-align:-6px;margin-right:6px;border:0;">Sona
                </td>
                <td align="right" style="font-family:${BRAND_MONO};font-size:13px;color:${BRAND.soft};">buildwithsona.com</td>
              </tr></table>
            </td>
          </tr>

          <!-- hero -->
          <tr>
            <td style="padding:22px 22px 0 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.hero};border-radius:14px;">
                <tr><td align="center" style="padding:30px 24px 0 24px;">${tagHtml}</td></tr>
                <tr><td class="hero-h" align="center" style="padding:20px 24px 24px 24px;font-family:${BRAND_FONT};font-size:42px;line-height:1.05;font-weight:600;letter-spacing:-1.6px;color:#ffffff;">${lines}</td></tr>
                <tr><td style="line-height:0;font-size:0;"><img src="${ASSETS}/wordmark.png" width="516" alt="" style="display:block;width:100%;height:auto;border:0;border-radius:0 0 14px 14px;"></td></tr>
              </table>
            </td>
          </tr>

          <!-- body -->
          <tr>
            <td class="px" style="padding:36px 52px 14px 52px;">
              ${body}
              ${code ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px 0;"><tr><td align="center" style="padding:22px 12px;border-radius:12px;background:#ffffff;border:1px solid ${BRAND.rule};font-family:${BRAND_MONO};font-size:34px;font-weight:600;letter-spacing:8px;color:${BRAND.ink};">${code}</td></tr></table>` : ''}
              ${note ? `<p style="margin:6px 0 22px 0;font-family:${BRAND_FONT};font-size:16px;line-height:1.6;color:${BRAND.soft};">${note}</p>` : ''}
            </td>
          </tr>

          <!-- social -->
          <tr>
            <td align="center" style="padding:26px 20px;border-top:1px solid ${BRAND.rule};border-bottom:1px solid ${BRAND.rule};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${icons}</tr></table>
            </td>
          </tr>

          <!-- buttons -->
          <tr>
            <td align="center" style="padding:34px 20px 40px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${buttons}</tr></table>
            </td>
          </tr>

          <!-- sign-off line -->
          <tr>
            <td class="px" style="padding:0 40px 30px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="font-family:${BRAND_MONO};font-size:12px;color:${BRAND.soft};">Find what works</td>
                <td align="center" width="40"><img src="${ASSETS}/spark.png" width="16" height="16" alt="" style="display:inline-block;border:0;"></td>
                <td align="right" style="font-family:${BRAND_MONO};font-size:12px;color:${BRAND.soft};">Write your own</td>
              </tr></table>
            </td>
          </tr>
          ${legal}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const strip = (h) => String(h).replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&rsquo;/g, '’').replace(/&mdash;/g, '—');
  const text = [
    (Array.isArray(title) ? title.join(' ') : title),
    '',
    ...(greeting ? [greeting, ''] : []),
    ...paragraphs.flatMap((h) => [strip(h), '']),
    ...(code ? [code, ''] : []),
    ...(note ? [strip(note), ''] : []),
    ...(primary ? [`${primary.label}: ${primary.href}`] : []),
    `${SITE}`,
    ...(footer ? ['', '—', footer.reason || '', `${LEGAL_NAME}, ${POSTAL_ADDRESS}`, `Unsubscribe: ${footer.unsubscribeUrl || unsubscribeMailto()}`] : []),
  ].join('\n');

  return { subject, html, text };
}

/**
 * Welcome email for someone who signs up for product updates.
 * @param {{ email: string, unsubscribeUrl?: string }} opts
 */
export function welcomeEmail({ email, unsubscribeUrl } = {}) {
  return brandEmail({
    subject: "You're on the list",
    preheader: 'What Sona does, and what you will hear from us.',
    tags: ['Product', 'Updates'],
    title: ["You're on", 'the list'],
    greeting: 'Hi,',
    paragraphs: [
      "Thanks for signing up. You'll get an email when something new ships in Sona, and nothing else.",
      "Here's what it does today. Sona finds posts that did far better than their creator usually does, not just the ones with the most views, and shows how each one is built: the hook, the turn and the pattern you can reuse.",
      'Then you write the post, in your own words. Nothing in Sona writes it for you, and that’s on purpose.',
      '— David',
    ],
    note: 'Questions or ideas? Reply to this email. I read every one.',
    primary: { label: 'Open Sona', href: `${SITE}/app` },
    footer: { reason: 'You get this email because you signed up for Sona product updates.', unsubscribeUrl: unsubscribeUrl || unsubscribeMailto(email) },
  });
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

  const unsub = unsubscribeUrl || unsubscribeMailto();

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
