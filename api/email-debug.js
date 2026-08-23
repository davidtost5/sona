// GET /api/email-debug — why didn't the welcome email arrive?
//
// The signup path is deliberately fail-soft: it logs a send failure and still
// returns success, because a broken mailer must never block a signup. That's
// right for users and useless for debugging — the reason never reaches anyone.
// This endpoint surfaces it.
//
// Admin-gated (same ADMIN_KEY as /api/outliers). Never returns a key or a
// password — only which transport is configured, the From domain, and the
// provider's verbatim error.
//
//   curl -H "x-admin-key: $ADMIN_KEY" https://buildwithsona.com/api/email-debug
//   curl -H "x-admin-key: $ADMIN_KEY" "https://buildwithsona.com/api/email-debug?to=you@example.com"

import crypto from 'crypto';
import { emailTransport, sendEmail } from './_email.js';
import { welcomeEmail } from './_email-templates.js';

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return res.status(503).json({ error: 'ADMIN_KEY not set on this deployment.' });
  if (!safeEqual(req.headers['x-admin-key'] || '', adminKey)) {
    return res.status(401).json({ error: 'Invalid admin key.' });
  }

  const from = process.env.EMAIL_FROM || '(unset — falls back to hello@buildwithsona.com)';
  const fromDomain = (from.match(/@([^>\s]+)/) || [])[1] || null;

  const report = {
    transport: emailTransport(),           // 'resend' | 'smtp' | null
    from,                                  // public info — appears in every email
    fromDomain,
    replyTo: process.env.EMAIL_REPLY_TO || '(unset)',
    legalName: process.env.MAIL_LEGAL_NAME || '(unset — footer shows a placeholder)',
    postalAddress: process.env.MAIL_FROM_ADDRESS ? '(set)' : '(UNSET — footer shows [SET MAIL_FROM_ADDRESS])',
  };

  if (!report.transport) {
    report.diagnosis = 'No transport configured. RESEND_API_KEY (or the SMTP_* set) is not visible to this deployment. Env vars load at deploy time — if you added them after the last deploy, redeploy.';
    return res.status(200).json(report);
  }

  const to = req.query && req.query.to;
  if (!to) {
    report.note = 'Add ?to=you@example.com to attempt a real send and see the provider\'s verbatim response.';
    return res.status(200).json(report);
  }

  const { subject, html, text } = welcomeEmail({ email: to });
  const started = Date.now();
  const result = await sendEmail({ to, subject, html, text, replyTo: process.env.EMAIL_REPLY_TO || undefined });

  report.send = { ...result, ms: Date.now() - started };
  if (!result.ok) {
    report.diagnosis = /domain|verif|not allowed|from/i.test(result.error || '')
      ? `Provider rejected the sender. EMAIL_FROM is on "${fromDomain}" — it must be a domain verified in your provider.`
      : 'Send failed — see send.error for the provider\'s verbatim message.';
  } else {
    report.diagnosis = 'Provider accepted the message. If it never lands, it was accepted then dropped or filtered — check the provider\'s own delivery log and the spam folder.';
  }
  return res.status(200).json(report);
}
