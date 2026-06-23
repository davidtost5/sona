// Stripe webhook — marks a paid Founding Member in Supabase.
//
// When someone completes the Founding Member Payment Link, Stripe POSTs a
// `checkout.session.completed` event here. We verify the signature, then insert
// a row into `founding_members` so /api/founding-count moves and you can grant
// founding access.
//
// Vercel → Settings → Environment Variables (Production):
//   STRIPE_WEBHOOK_SECRET = whsec_...   (Stripe → Developers → Webhooks → your endpoint → Signing secret)
//
// Stripe setup:
//   1. Developers → Webhooks → Add endpoint → https://sonaapp.so/api/stripe-webhook
//   2. Subscribe to event: checkout.session.completed
//   3. Copy the signing secret → paste as STRIPE_WEBHOOK_SECRET above
//
// No `stripe` npm package needed — we verify the HMAC signature with Node crypto.

import { createHmac, timingSafeEqual } from 'crypto';
import { supabase } from './_supabase.js';

// Vercel must hand us the RAW body for signature verification (not parsed JSON).
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Verify Stripe's `Stripe-Signature` header: "t=<ts>,v1=<hex hmac>"
function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(',').map((kv) => kv.split('=').map((s) => s.trim()))
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  // Reject events older than 5 minutes (replay protection).
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).end('Webhook not configured');

  const rawBody = await readRawBody(req);
  const sig = req.headers['stripe-signature'];
  if (!verifyStripeSignature(rawBody, sig, secret)) {
    return res.status(400).end('Invalid signature');
  }

  let event;
  try { event = JSON.parse(rawBody); } catch (_) { return res.status(400).end('Bad payload'); }

  if (event.type === 'checkout.session.completed') {
    const s = event.data?.object || {};
    const email = s.customer_details?.email || s.customer_email || null;
    const row = {
      email: email || 'unknown',
      stripe_customer_id: s.customer || null,
      stripe_session_id: s.id || null,
      amount_cents: s.amount_total ?? null,
    };
    if (supabase) {
      try {
        // unique on stripe_session_id → ignore duplicate deliveries
        await supabase.from('founding_members').upsert(row, { onConflict: 'stripe_session_id' });
      } catch (e) {
        console.error('founding_members insert failed', e?.message || e);
        // Still 200 so Stripe doesn't hammer retries on a transient DB error;
        // the event is logged for manual reconciliation.
      }
    }
  }

  // Acknowledge all events we received and verified.
  return res.status(200).json({ received: true });
}
