// Shared email transport for serverless functions.
//
// Two backends, picked automatically by which env vars are set. SMTP wins if
// configured, so you can start on the mailbox you already own and move to a
// transactional provider later without touching call sites.
//
// ── Option A: SMTP (Spacemail, or any mailbox host) ──
//   SMTP_HOST = mail.spacemail.com
//   SMTP_PORT = 465            (465 = implicit SSL, 587 = STARTTLS)
//   SMTP_USER = hello@buildwithsona.com
//   SMTP_PASS = <mailbox password>
//   EMAIL_FROM = Sona <hello@buildwithsona.com>     ← must match SMTP_USER's domain
//
// ── Option B: Resend (HTTP API) ──
//   RESEND_API_KEY = re_...
//   EMAIL_FROM     = Sona <hello@buildwithsona.com>
//
// Deliberately fail-soft: if nothing is configured, or the send errors, or the
// server hangs, the caller still succeeds. Signing up must never fail because a
// welcome email didn't go out — the row in Supabase is what actually matters.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// A hung SMTP socket would otherwise stall the whole function — and since the
// welcome send is awaited before responding, that would delay the user's signup.
// Fail fast instead; a missed welcome email is cheaper than a broken signup.
const SEND_TIMEOUT_MS = 8000;

export function emailTransport() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
  if (process.env.RESEND_API_KEY) return 'resend';
  return null;
}

export const emailConfigured = () => emailTransport() !== null;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

async function sendViaSmtp({ from, to, subject, html, text, replyTo }) {
  // Imported lazily so the Resend path doesn't pay for it, and so a missing
  // dependency can't crash functions that never send mail.
  const nodemailer = (await import('nodemailer')).default;

  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 upgrades via STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    pool: false, // serverless: one connection per invocation, never reused
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });

  const info = await transporter.sendMail({
    from, to: Array.isArray(to) ? to.join(', ') : to, subject, html, text,
    replyTo: replyTo || undefined,
  });
  return { ok: true, id: info && info.messageId };
}

async function sendViaResend({ from, to, subject, html, text, replyTo }) {
  const payload = { from, to: Array.isArray(to) ? to : [to], subject };
  if (html) payload.html = html;
  if (text) payload.text = text;
  if (replyTo) payload.reply_to = replyTo;

  const r = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify(payload),
  });

  const body = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: (body && body.message) || `HTTP ${r.status}` };
  return { ok: true, id: body && body.id };
}

/**
 * Send one email. Never throws.
 * @returns {Promise<{ok: boolean, id?: string, skipped?: boolean, via?: string, error?: string}>}
 */
export async function sendEmail({ to, subject, html, text, replyTo }) {
  const via = emailTransport();
  const from = process.env.EMAIL_FROM || 'Sona <hello@buildwithsona.com>';

  if (!via) return { ok: false, skipped: true, error: 'No email transport configured' };
  if (!to || !subject || (!html && !text)) {
    return { ok: false, error: 'to, subject, and one of html/text are required' };
  }

  try {
    const send = via === 'smtp'
      ? sendViaSmtp({ from, to, subject, html, text, replyTo })
      : sendViaResend({ from, to, subject, html, text, replyTo });

    const result = await withTimeout(send, SEND_TIMEOUT_MS + 2000, `${via} send`);
    if (!result.ok) console.error(`[email] ${via} send failed:`, result.error);
    return { ...result, via };
  } catch (e) {
    // Auth failures, unverified domains, DNS problems, timeouts — all land here.
    console.error(`[email] ${via} send threw:`, (e && e.message) || e);
    return { ok: false, via, error: (e && e.message) || 'unknown error' };
  }
}
