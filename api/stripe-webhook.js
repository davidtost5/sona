// Stripe webhook — keeps Supabase in step with who is paying for what.
//
// Stripe POSTs events here. We verify the signature, then:
//   checkout.session.completed      → links the subscription to the buyer's email
//   customer.subscription.created   ┐
//   customer.subscription.updated   ├→ records plan, status and renewal date
//   customer.subscription.deleted   ┘
// Cancelling in the Stripe customer portal arrives as `updated` with
// cancel_at_period_end = true, then `deleted` when the paid period runs out.
// Failed renewals arrive as `updated` with status past_due / unpaid.
//
// Rows land in `subscriptions` (migration-billing.sql). One-off checkouts with
// no subscription still go to `founding_members`, which /api/founding-count reads.
//
// Vercel → Settings → Environment Variables (Production):
//   STRIPE_WEBHOOK_SECRET = whsec_...   (Stripe → Developers → Webhooks → your endpoint → Signing secret)
//
// Stripe setup:
//   1. Developers → Webhooks → Add endpoint → https://buildwithsona.com/api/stripe-webhook
//   2. Subscribe to: checkout.session.completed, customer.subscription.created,
//      customer.subscription.updated, customer.subscription.deleted
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

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

// Plan from the amount Stripe charged, so no price ids have to be copied into
// env vars. Matches the ladder in checkout.js; anything else is stored as null
// and the price id is kept for reconciliation.
const PLAN_BY_AMOUNT = { 1900: 'creator', 19000: 'creator', 3900: 'pro', 39000: 'pro' };

// supabase-js reports a failed write in its result instead of throwing.
function check({ error }) { if (error) throw error; }

const isoFromUnix = (t) => (t ? new Date(t * 1000).toISOString() : null);

// Only columns Stripe's subscription object actually carries. Upsert updates
// just the columns given, so this never wipes the email written at checkout.
export function subscriptionRow(sub) {
  const price = sub.items?.data?.[0]?.price || {};
  // current_period_end moved onto the subscription item in newer API versions.
  const periodEnd = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
  return {
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null,
    status: sub.status || null,
    plan: PLAN_BY_AMOUNT[price.unit_amount] || null,
    billing_interval: price.recurring?.interval || null,
    stripe_price_id: price.id || null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    current_period_end: isoFromUnix(periodEnd),
    updated_at: new Date().toISOString(),
  };
}

async function recordCheckout(s) {
  const email = s.customer_details?.email || s.customer_email || null;
  if (s.mode === 'subscription' && s.subscription) {
    check(await supabase.from('subscriptions').upsert({
      stripe_subscription_id: s.subscription,
      stripe_customer_id: s.customer || null,
      email,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stripe_subscription_id' }));
    return;
  }
  // unique on stripe_session_id → ignore duplicate deliveries
  check(await supabase.from('founding_members').upsert({
    email: email || 'unknown',
    stripe_customer_id: s.customer || null,
    stripe_session_id: s.id || null,
    amount_cents: s.amount_total ?? null,
  }, { onConflict: 'stripe_session_id' }));
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

  const obj = event.data?.object || {};
  if (supabase) {
    try {
      if (event.type === 'checkout.session.completed') {
        await recordCheckout(obj);
      } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
        check(await supabase.from('subscriptions')
          .upsert(subscriptionRow(obj), { onConflict: 'stripe_subscription_id' }));
      }
    } catch (e) {
      console.error(`[stripe-webhook] ${event.type} write failed`, e?.message || e);
      // Still 200 so Stripe doesn't hammer retries on a transient DB error;
      // the event is logged for manual reconciliation.
    }
  }

  // Acknowledge all events we received and verified.
  return res.status(200).json({ received: true });
}
