// Polar webhook — keeps Supabase in step with who is paying for what.
//
// Polar is Sona's merchant of record: it sells the plan, charges the customer
// and handles tax. Every subscription.* event carries the whole subscription,
// so each one simply upserts its row in `subscriptions` (migration-billing.sql).
// Cancelling in the portal arrives with cancel_at_period_end = true, and later
// with status canceled; failed renewals arrive with status past_due.
//
// Vercel → Settings → Environment Variables (Production):
//   POLAR_WEBHOOK_SECRET = whsec_...   (Polar → Settings → Webhooks → your endpoint)
//
// Polar setup:
//   1. Settings → Webhooks → Add endpoint → https://buildwithsona.com/api/polar-webhook
//   2. Format: Raw. Subscribe to every subscription.* event.
//   3. Copy the secret → paste as POLAR_WEBHOOK_SECRET above
//
// Run migration-billing.sql first: Polar disables an endpoint after 10 failures
// in a row, and a missing table fails every delivery.
//
// No SDK needed. Polar signs with Standard Webhooks, verified below.

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

// Standard Webhooks: HMAC-SHA256 of `id.timestamp.body`, keyed with the secret
// after its whsec_ prefix, sent as a space-separated list of `v1,<base64>`.
function verifySignature(rawBody, headers, secret) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signature = headers['webhook-signature'];
  if (!id || !timestamp || !signature) return false;

  // Reject anything older than five minutes (replay protection).
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = Buffer.from(
    createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')
  );
  return signature.split(' ').some((part) => {
    const given = Buffer.from(part.split(',')[1] || '');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// Plan from the product's name in Polar ("Creator", "Creator Pro"), so no
// product ids have to be copied into env vars. Anything else is stored as null
// and the product id is kept for reconciliation.
function planFromName(name) {
  if (/pro\b/i.test(name || '')) return 'pro';
  if (/creator/i.test(name || '')) return 'creator';
  return null;
}

export function subscriptionRow(sub) {
  const row = {
    polar_subscription_id: sub.id,
    polar_customer_id: sub.customer_id || sub.customer?.id || null,
    status: sub.status || null,
    plan: planFromName(sub.product?.name),
    billing_interval: sub.recurring_interval || sub.product?.recurring_interval || null,
    polar_product_id: sub.product_id || sub.product?.id || null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    current_period_end: sub.current_period_end || null,
    updated_at: new Date().toISOString(),
  };
  // Only written when present, so a sparse event never wipes a known email.
  if (sub.customer?.email) row.email = sub.customer.email;
  return row;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) return res.status(503).end('Webhook not configured');

  const rawBody = await readRawBody(req);
  if (!verifySignature(rawBody, req.headers, secret)) {
    return res.status(400).end('Invalid signature');
  }

  let event;
  try { event = JSON.parse(rawBody); } catch (_) { return res.status(400).end('Bad payload'); }

  if (supabase && String(event.type || '').startsWith('subscription.') && event.data?.id) {
    const { error } = await supabase.from('subscriptions')
      .upsert(subscriptionRow(event.data), { onConflict: 'polar_subscription_id' });
    if (error) {
      // A non-2xx makes Polar retry, so a passing database error loses nothing.
      console.error(`[polar-webhook] ${event.type} write failed`, error.message);
      return res.status(500).end('Write failed');
    }
  }

  // Acknowledge everything verified, including events we don't act on.
  return res.status(200).json({ received: true });
}
