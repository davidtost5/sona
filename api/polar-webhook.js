// Polar.so webhook — marks a paid Founding Member in Supabase.
//
// When someone completes a purchase or subscription on Polar.so, Polar POSTs
// a webhook event here (e.g. `order.created`, `checkout.updated`, `subscription.created`).
// We verify the signature using Standard Webhooks HMAC-SHA256, then insert a row into
// `founding_members` in Supabase.
//
// Vercel → Settings → Environment Variables (Production):
//   POLAR_WEBHOOK_SECRET = whsec_...   (Polar Dashboard → Webhooks → Signing Secret)
//
// Polar setup:
//   1. Polar Dashboard → Webhooks → Add Endpoint → https://sonaapp.so/api/polar-webhook
//   2. Subscribe to events: order.created, checkout.updated, subscription.created
//   3. Copy the signing secret → paste as POLAR_WEBHOOK_SECRET above

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

/**
 * Verify Polar webhook signature.
 * Polar uses the Standard Webhooks specification.
 * Headers: webhook-id, webhook-timestamp, webhook-signature
 * Secret format: whsec_... (base64-encoded secret)
 */
function verifyPolarSignature(rawBody, headers, secret) {
  if (!secret) return false;

  const id = headers['webhook-id'] || headers['polar-webhook-id'];
  const timestamp = headers['webhook-timestamp'] || headers['polar-webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'] || headers['polar-webhook-signature'] || headers['polar-signature'];

  if (!signatureHeader) return false;

  // Replay attack prevention (10 min threshold)
  if (timestamp) {
    const ts = parseInt(timestamp, 10);
    if (!isNaN(ts)) {
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - ts) > 600) return false;
    }
  }

  // Extract key secret bytes
  let keyBytes;
  if (secret.startsWith('whsec_')) {
    try {
      keyBytes = Buffer.from(secret.slice(6), 'base64');
    } catch (_) {
      keyBytes = Buffer.from(secret);
    }
  } else {
    keyBytes = Buffer.from(secret);
  }

  // Standard Webhooks signed payload format: "${id}.${timestamp}.${rawBody}"
  const signedPayload = id && timestamp ? `${id}.${timestamp}.${rawBody}` : rawBody;

  // Sign with HMAC-SHA256
  const hmac = createHmac('sha256', keyBytes).update(signedPayload);
  const expectedBase64 = hmac.digest('base64');
  const expectedHex = createHmac('sha256', keyBytes).update(signedPayload).digest('hex');

  // Signature header may contain multiple signatures separated by spaces (e.g. "v1,base64sig v1,sig2")
  const signatures = signatureHeader.split(/\s+/);
  for (const sig of signatures) {
    const sigValue = sig.includes(',') ? sig.split(',')[1] : (sig.includes('=') ? sig.split('=')[1] : sig);
    if (!sigValue) continue;

    const bufSig = Buffer.from(sigValue);
    const bufExpectedB64 = Buffer.from(expectedBase64);
    const bufExpectedHex = Buffer.from(expectedHex);

    if (bufSig.length === bufExpectedB64.length && timingSafeEqual(bufSig, bufExpectedB64)) {
      return true;
    }
    if (bufSig.length === bufExpectedHex.length && timingSafeEqual(bufSig, bufExpectedHex)) {
      return true;
    }
  }

  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) return res.status(503).end('Webhook secret not configured');

  const rawBody = await readRawBody(req);

  // In development/testing mode, allow authorization bypass if test key is sent or in strict signature mode
  const isVerified = verifyPolarSignature(rawBody, req.headers, secret);
  if (!isVerified) {
    return res.status(400).end('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (_) {
    return res.status(400).end('Bad payload');
  }

  const type = event.type || event.event || '';
  const data = event.data || event.payload || {};

  // Process payment/fulfillment events: order.created, checkout.updated (succeeded), subscription.created/active
  const isOrderCreated = type === 'order.created';
  const isCheckoutSucceeded = type === 'checkout.updated' && (data.status === 'succeeded' || data.status === 'confirmed');
  const isSubscriptionActive = (type === 'subscription.created' || type === 'subscription.active') && data.status !== 'canceled';

  if (isOrderCreated || isCheckoutSucceeded || isSubscriptionActive) {
    const email = data.customer?.email || data.customer_email || data.user?.email || data.email || null;
    const polarCustomerId = data.customer_id || data.customer?.id || data.user_id || null;
    const polarOrderId = data.order_id || (isOrderCreated ? data.id : null) || null;
    const polarCheckoutId = data.checkout_id || (type.startsWith('checkout') ? data.id : null) || null;
    const polarSubId = data.subscription_id || (type.startsWith('subscription') ? data.id : null) || null;
    const amountCents = data.amount ?? data.total_amount ?? data.net_amount ?? null;

    const row = {
      email: email || 'unknown@polar.sh',
      payment_provider: 'polar',
      polar_customer_id: polarCustomerId,
      polar_order_id: polarOrderId,
      polar_checkout_id: polarCheckoutId,
      polar_subscription_id: polarSubId,
      amount_cents: amountCents,
    };

    if (supabase) {
      try {
        if (polarOrderId) {
          await supabase.from('founding_members').upsert(row, { onConflict: 'polar_order_id' });
        } else {
          await supabase.from('founding_members').insert(row);
        }
      } catch (e) {
        console.error('Polar founding_members insert failed:', e?.message || e);
      }
    }
  }

  return res.status(200).json({ received: true });
}
