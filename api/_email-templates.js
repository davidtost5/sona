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
 * Sona's product email, in the site's own look: a white sheet on a pale
 * slate page, the logo, a painted panel (the homepage hero's sky) holding a
 * two-tone headline, a short body and one blue button.
 *
 *   brandEmail({
 *     subject, preheader,
 *     title: ['Welcome to Sona, David.', "Here's where to start."],  // second line is the soft tone
 *     panel: outlierCard(),            // optional trusted HTML under the headline
 *     greeting: 'Hi David,',
 *     paragraphs: ['…'],               // trusted HTML, written in code
 *     steps: [{ title, body, link }],  // optional numbered steps
 *     code: '{{otp_code}}',            // optional one-time code box
 *     note: 'Questions? Reply to this email.',
 *     primary: { label: 'Open Sona', href: SITE + '/app' },
 *     signoff: 'David',
 *     footer: { reason, unsubscribeUrl, postal },   // postal + unsubscribe: marketing only
 *   })
 *
 * Email clients drop most CSS, so the panel's gradient sits on top of a solid
 * colour: Apple Mail and iOS show the sky, Gmail and Outlook show the flat
 * blue. Corners square off in Outlook. Nothing breaks either way.
 *
 * Strings are inserted as given, so a Clerk template can pass Handlebars
 * placeholders such as {{otp_code}} straight through. Anything that comes
 * from a user (a first name) must go through esc() before it gets here.
 * ────────────────────────────────────────────────────────────────────────── */

const ASSETS = `${SITE}/email`;
const BRAND = {
  page: '#eef2f7',
  sheet: '#ffffff',
  ink: '#0f172a',
  body: '#334155',
  soft: '#64748b',
  faint: '#94a3b8',
  rule: '#e2e8f0',
  wash: '#f8fafc',
  blue: '#2563eb',
  blueInk: '#1d4ed8',
  violet: '#7c3aed',
  orange: '#ea580c',
  sky: '#dfe7fb',
  skyImage: 'linear-gradient(180deg, #dbe6fb 0%, #e9eefc 52%, #fbe7d6 100%)',
};
const BRAND_FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const BRAND_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const STEP_TONES = [BRAND.blue, BRAND.violet, BRAND.orange];

function blueButton({ label, href }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 0 0;"><tr>
                <td align="center" bgcolor="${BRAND.blue}" style="border-radius:10px;background:${BRAND.blue};">
                  <a href="${esc(href)}" style="display:inline-block;padding:15px 28px;font-family:${BRAND_FONT};font-size:16px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(label)} &rarr;</a>
                </td>
              </tr></table>`;
}

function stepsTable(steps) {
  const rows = steps.map((s, n) => {
    const tone = STEP_TONES[n % STEP_TONES.length];
    const last = n === steps.length - 1;
    const link = s.link ? `<br><a href="${esc(s.link.href)}" style="font-family:${BRAND_FONT};font-size:14px;font-weight:600;color:${BRAND.blueInk};text-decoration:none;">${esc(s.link.label)} &rarr;</a>` : '';
    return `<tr>
                  <td valign="top" width="44" style="padding:0 0 ${last ? 0 : 22}px 0;">
                    <div style="width:30px;height:30px;border-radius:15px;background:${tone};font-family:${BRAND_FONT};font-size:14px;font-weight:700;line-height:30px;color:#ffffff;text-align:center;">${n + 1}</div>
                  </td>
                  <td valign="top" style="padding:3px 0 ${last ? 0 : 22}px 0;font-family:${BRAND_FONT};font-size:15px;line-height:1.6;color:${BRAND.body};">
                    <b style="display:block;margin:0 0 2px 0;font-size:16px;color:${BRAND.ink};">${esc(s.title)}</b>${s.body}${link}
                  </td>
                </tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 30px 0;background:${BRAND.wash};border:1px solid ${BRAND.rule};border-radius:14px;">
                <tr><td class="steps-pad" style="padding:22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>
              </table>`;
}

/**
 * A post card for the panel: what an outlier looks like in Sona, with the
 * hook underlined. The default is the real Justin Welsh post from the tour.
 */
export function outlierCard({
  initials = 'JW', name = 'Justin Welsh', where = 'on LinkedIn', mult = '3×', usual = 'his average',
  hook = 'The older I get, the more I realize your calendar is a list of your priorities.',
  rest = 'It tells the truth about what you actually care about.',
} = {}) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid ${BRAND.rule};border-radius:14px;">
                  <tr><td style="padding:18px 20px 16px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                      <td width="42" valign="middle"><div style="width:32px;height:32px;border-radius:16px;background:#475569;font-family:${BRAND_FONT};font-size:12px;font-weight:700;line-height:32px;color:#ffffff;text-align:center;">${esc(initials)}</div></td>
                      <td valign="middle" style="font-family:${BRAND_FONT};font-size:14px;line-height:1.3;color:${BRAND.ink};"><b>${esc(name)}</b><br><span style="font-size:12.5px;color:${BRAND.soft};">${esc(where)}</span></td>
                      <td align="right" valign="middle" style="font-family:${BRAND_MONO};font-size:22px;font-weight:600;line-height:1;color:${BRAND.blue};white-space:nowrap;">${esc(mult)}<br><span style="font-family:${BRAND_FONT};font-size:11.5px;font-weight:400;color:${BRAND.soft};">${esc(usual)}</span></td>
                    </tr></table>
                    <p style="margin:14px 0 0 0;font-family:${BRAND_FONT};font-size:16px;line-height:1.6;color:${BRAND.ink};"><span style="background:#e8efff;border-bottom:2px solid ${BRAND.blue};">${esc(hook)}</span> ${esc(rest)}</p>
                  </td></tr>
                </table>`;
}

export function brandEmail(opts = {}) {
  const {
    subject = '', preheader = '', title = [], panel = '', panelText = '', greeting = '',
    paragraphs = [], steps = [], code = '', note = '', primary = null,
    signoff = '', footer = null,
  } = opts;
  const [head, tone] = Array.isArray(title) ? title : [title];
  const headline = esc(head) + (tone ? `<br><span style="color:${BRAND.soft};">${esc(tone)}</span>` : '');
  const body = (greeting ? [greeting] : []).concat(paragraphs)
    .map((h) => `<p style="margin:0 0 20px 0;font-family:${BRAND_FONT};font-size:17px;line-height:1.65;color:${BRAND.body};">${h}</p>`).join('\n              ');
  const codeBox = code ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 26px 0;"><tr><td align="center" style="padding:22px 12px;border-radius:14px;background:${BRAND.wash};border:1px solid ${BRAND.rule};font-family:${BRAND_MONO};font-size:34px;font-weight:600;letter-spacing:10px;color:${BRAND.ink};">${code}</td></tr></table>` : '';
  const legalLines = footer ? [
    esc(footer.reason || ''),
    footer.postal ? `${esc(LEGAL_NAME)}, ${esc(POSTAL_ADDRESS)}` : '',
    footer.unsubscribeUrl ? `<a href="${esc(footer.unsubscribeUrl)}" style="color:${BRAND.soft};text-decoration:underline;">Unsubscribe</a>` : '',
  ].filter(Boolean).join('<br>') : '';

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
    .panel-pad { padding: 30px 20px 20px 20px !important; }
    .panel-card { padding: 0 14px 14px 14px !important; }
    .steps-pad { padding: 18px 16px !important; }
    .h1 { font-size: 30px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${esc(preheader)}&#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.page};">
    <tr>
      <td align="center" style="padding:28px 10px 40px 10px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${BRAND.sheet};border:1px solid ${BRAND.rule};border-radius:18px;">

          <tr>
            <td class="px" style="padding:24px 36px 20px 36px;">
              <a href="${SITE}" style="font-family:${BRAND_FONT};font-size:19px;font-weight:600;letter-spacing:-0.4px;color:${BRAND.ink};text-decoration:none;"><img src="${ASSETS}/mark.png" width="28" height="28" alt="" style="display:inline-block;vertical-align:-8px;margin-right:8px;border:0;border-radius:7px;">Sona</a>
            </td>
          </tr>

          <tr>
            <td style="padding:0 12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.sky}" style="background-color:${BRAND.sky};background-image:${BRAND.skyImage};border-radius:16px;">
                <tr><td class="panel-pad" style="padding:40px 34px ${panel ? 24 : 40}px 34px;">
                  <h1 class="h1" style="margin:0;font-family:${BRAND_FONT};font-size:36px;line-height:1.1;font-weight:600;letter-spacing:-1.2px;color:${BRAND.ink};">${headline}</h1>
                </td></tr>
                ${panel ? `<tr><td class="panel-card" style="padding:0 34px 34px 34px;">${panel}</td></tr>` : ''}
              </table>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:36px 44px 12px 44px;">
              ${body}
              ${steps.length ? stepsTable(steps) : ''}
              ${codeBox}
              ${primary ? blueButton(primary) : ''}
              ${note ? `<p style="margin:26px 0 0 0;font-family:${BRAND_FONT};font-size:15px;line-height:1.6;color:${BRAND.soft};">${note}</p>` : ''}
              ${signoff ? `<p style="margin:26px 0 0 0;font-family:${BRAND_FONT};font-size:17px;line-height:1.6;color:${BRAND.body};">${signoff}</p>` : ''}
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:30px 44px 32px 44px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${BRAND.rule};font-size:0;line-height:0;">&nbsp;</td></tr></table>
              <p style="margin:20px 0 0 0;font-family:${BRAND_FONT};font-size:13px;line-height:1.7;color:${BRAND.soft};">
                <a href="${SITE}" style="color:${BRAND.ink};font-weight:600;text-decoration:none;">Sona</a> finds the posts that beat the average in your niche.<br>
                <a href="https://x.com/davidtostscale" style="color:${BRAND.soft};text-decoration:underline;">X</a>&nbsp;&nbsp;&nbsp;<a href="https://www.linkedin.com/in/davidtost/" style="color:${BRAND.soft};text-decoration:underline;">LinkedIn</a>&nbsp;&nbsp;&nbsp;<a href="${SITE}/docs.html" style="color:${BRAND.soft};text-decoration:underline;">Docs</a>
              </p>
              ${legalLines ? `<p style="margin:14px 0 0 0;font-family:${BRAND_FONT};font-size:12px;line-height:1.7;color:${BRAND.faint};">${legalLines}</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // For the text/plain part only; this output is never rendered as HTML.
  // Tags are removed until none are left, so a nested fragment such as
  // "<scr<b>ipt>" can't survive one pass.
  const untag = (s) => { let prev; do { prev = s; s = s.replace(/<[^<>]*>/g, ''); } while (s !== prev); return s.replace(/[<>]/g, ''); };
  const strip = (h) => untag(String(h).replace(/<br\s*\/?>/g, '\n')).replace(/&nbsp;/g, ' ')
    .replace(/&rarr;/g, '→').replace(/&rsquo;/g, '’').replace(/&mdash;/g, '—').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const text = [
    [head, tone].filter(Boolean).join(' '),
    '',
    ...(panelText ? [panelText, ''] : []),
    ...(greeting ? [strip(greeting), ''] : []),
    ...paragraphs.flatMap((h) => [strip(h), '']),
    ...steps.flatMap((s, n) => [`${n + 1}. ${s.title}`, strip(s.body), ...(s.link ? [`${s.link.label}: ${s.link.href}`] : []), '']),
    ...(code ? [code, ''] : []),
    ...(primary ? [`${primary.label}: ${primary.href}`, ''] : []),
    ...(note ? [strip(note), ''] : []),
    ...(signoff ? [strip(signoff), ''] : []),
    '—',
    `Sona: ${SITE}`,
    ...(footer ? [strip(footer.reason || ''),
      ...(footer.postal ? [`${LEGAL_NAME}, ${POSTAL_ADDRESS}`] : []),
      ...(footer.unsubscribeUrl ? [`Unsubscribe: ${footer.unsubscribeUrl}`] : [])] : []),
  ].join('\n');

  return { subject, html, text };
}

// Clerk names are free text the user typed. Keep them to one short line.
function cleanName(name) {
  const s = String(name || '').replace(/[\r\n\t<>]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > 40 ? '' : s;
}

/**
 * The email someone gets right after creating a Sona account.
 * Transactional (it's about the account they just made), so no unsubscribe.
 * @param {{ firstName?: string, email?: string }} opts
 */
export function accountWelcomeEmail({ firstName, email } = {}) {
  const name = cleanName(firstName);
  const app = `${SITE}/app`;
  return brandEmail({
    subject: name ? `Welcome to Sona, ${name}` : 'Welcome to Sona',
    preheader: 'Three steps from a post that worked to one in your own words.',
    title: [name ? `Welcome to Sona, ${name}.` : 'Welcome to Sona.', 'Here’s where to start.'],
    panel: outlierCard(),
    panelText: 'Justin Welsh on LinkedIn, 3× his average:\n“The older I get, the more I realize your calendar is a list of your priorities. It tells the truth about what you actually care about.”',
    greeting: name ? `Hi ${esc(name)},` : 'Hi,',
    paragraphs: [
      'Your account is ready. That post did three times what Justin Welsh usually gets. Sona finds posts like it in your niche, shows you why they worked, and helps you write your own version.',
    ],
    steps: [
      { title: 'Find it.', body: 'Open Discover and pick your niche. Posts are sorted by how far they beat their creator’s own average.', link: { label: 'Open Discover', href: `${app}#discover` } },
      { title: 'Decode it.', body: 'Open any post to see its hook, the turn and where it lands. Save the lines you want to reuse.', link: { label: 'Decode a post', href: `${app}#decode` } },
      { title: 'Write it.', body: 'Fill in your playbook once: what you post about, how you sound, what you’d never say. It sits beside every draft.', link: { label: 'Set up your playbook', href: `${app}#voice` } },
    ],
    primary: { label: 'Open Sona', href: app },
    note: 'Your free plan holds 10 saved ideas. No card needed.',
    signoff: 'If anything is confusing or broken, reply to this email. I read every reply.<br><br>David<br><span style="color:#64748b;">Maker of Sona</span>',
    footer: { reason: `You’re getting this because you created a Sona account${email ? ` with ${email}` : ''}.` },
  });
}

/**
 * Welcome email for someone who signs up for product updates (the waitlist).
 * Marketing email: it carries the postal address and an unsubscribe link.
 * @param {{ email: string, unsubscribeUrl?: string }} opts
 */
export function welcomeEmail({ email, unsubscribeUrl } = {}) {
  return brandEmail({
    subject: "You're on the list",
    preheader: 'What Sona does, and what you will hear from us.',
    title: ["You're on the list.", 'Here’s what to expect.'],
    greeting: 'Hi,',
    paragraphs: [
      "Thanks for signing up. You'll get an email when something new ships in Sona, and nothing else.",
      "Here's what it does today. Sona finds posts that did far better than their creator usually does, not just the ones with the most views, and shows how each one is built: the hook, the turn and the pattern you can reuse.",
      'Then you write the post, in your own words. Nothing in Sona writes it for you, and that’s on purpose.',
    ],
    primary: { label: 'Open Sona', href: `${SITE}/app` },
    note: 'Questions or ideas? Reply to this email. I read every one.',
    signoff: 'David',
    footer: { reason: 'You get this email because you signed up for Sona product updates.', postal: true, unsubscribeUrl: unsubscribeUrl || unsubscribeMailto(email) },
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
