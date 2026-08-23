// Vercel Serverless Function — Waitlist (Request access + footer newsletter)
// Used only when data.js MODE = 'api'. Persists to Supabase if configured,
// otherwise falls back to an in-memory list (resets on redeploy).
//
// On a successful signup we also send a welcome email (Resend, see _email.js).
// The email is best-effort: if it fails, the signup still succeeds. The row is
// what matters — a missing welcome email is recoverable, a lost lead isn't.

import { supabase } from './_supabase.js';
import { sendEmail } from './_email.js';
import { welcomeEmail } from './_email-templates.js';
import { rateLimit, tooMany } from './_rate-limit.js';

const memory = [];

// `source` tells a newsletter subscriber apart from someone requesting access —
// they should not get the same email. The column was added after the table
// shipped, so prod may not have it yet; insertRecord() degrades rather than
// failing the signup outright.
const KNOWN_SOURCES = ['footer-newsletter', 'request-access', 'contact', 'unknown'];

async function insertRecord(record) {
  const { error } = await supabase.from('waitlist').insert(record);
  if (!error) return { error: null };

  // PGRST204 = column missing from PostgREST's schema cache, 42703 = undefined column.
  // Retry without `source` so a pending migration can't take signups down.
  const missingColumn = error.code === 'PGRST204' || error.code === '42703'
    || /source/i.test(error.message || '');
  if (missingColumn && 'source' in record) {
    console.warn('[Waitlist] `source` column missing — inserting without it. Run the migration in schema.sql.');
    const { source, ...withoutSource } = record;
    return await supabase.from('waitlist').insert(withoutSource);
  }
  return { error };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Every accepted signup writes a row and sends an email. Unthrottled, that's a
  // way to burn the sending quota and get a young domain marked as a spammer.
  const LIMIT = { windowMs: 10 * 60 * 1000, perIp: 5, global: 100 };
  if (tooMany(res, rateLimit(req, 'waitlist', LIMIT), LIMIT.windowMs,
      'Too many signups from this address. Try again shortly.')) return;

  const { name, email, company, source } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  const record = {
    name: (name || '').trim(),
    email: email.trim().toLowerCase(),
    company: (company || '').trim(),
    source: KNOWN_SOURCES.includes(source) ? source : 'unknown',
  };

  if (supabase) {
    const { error } = await insertRecord(record);
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: "You're already on the list." });
      console.error('[Waitlist]', error.message);
      return res.status(500).json({ error: 'Could not save. Please try again.' });
    }
  } else {
    memory.push({ ...record, created_at: new Date().toISOString() });
    console.log('[Waitlist]', JSON.stringify(record));
  }

  // Best-effort welcome email. Awaited (not fire-and-forget) because the runtime
  // can freeze the function the moment we respond, which would drop the request.
  const { subject, html, text } = welcomeEmail({ email: record.email });
  // Reply-to matters here: mail is sent from the verified sending subdomain
  // (send.buildwithsona.com), which has no mailbox behind it — MX points at the
  // root domain only. Without this, anyone hitting Reply gets a bounce.
  const sent = await sendEmail({
    to: record.email,
    subject, html, text,
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
  });
  if (!sent.ok && !sent.skipped) {
    console.error('[Waitlist] welcome email failed:', sent.error);
  }

  return res.status(200).json({ success: true, message: "You're on the list. We'll reach out soon." });
}
