// Clerk webhook — deletes a user's rows when their Clerk account is deleted.
//
// WHY THIS IS NOT OPTIONAL
// Under Supabase Auth, every user table carried
// `user_id uuid references auth.users(id) on delete cascade`, so deleting the
// account cleaned up its rows for free. migration-clerk-auth.sql drops those
// foreign keys — a Clerk id is not a row in auth.users — and this endpoint is
// what replaces the cascade. Without it, deleting an account leaves the data
// behind, and privacy.html's "ask us to correct or delete it" stops being true.
//
// SETUP
//   1. Clerk Dashboard → Webhooks → Add Endpoint
//        URL:    https://buildwithsona.com/api/clerk-webhook
//        Events: user.deleted
//   2. Copy the signing secret Clerk shows (starts `whsec_`)
//   3. Add it to Vercel as CLERK_WEBHOOK_SECRET
//
// Requires SUPABASE_SERVICE_ROLE_KEY, already set for the other endpoints. That
// key bypasses RLS by design — it is the only way to delete rows on behalf of a
// user who no longer exists. It is server-side only and must never be sent to
// the browser.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabase } from './_supabase.js';

// Svix signs the raw bytes. Vercel's JSON parser would re-serialise them and
// change the signature, so it is turned off here.
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Svix scheme: HMAC-SHA256 over `${id}.${timestamp}.${body}`, keyed with the
// base64-decoded secret, compared against the v1 signatures in svix-signature.
function verifySvix(rawBody, headers, secret) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signature = headers['svix-signature'];
  if (!id || !timestamp || !signature) return false;

  // Reject anything older than five minutes so a captured request cannot be
  // replayed indefinitely.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
  const expectedBuf = Buffer.from(expected);

  // The header carries a space-delimited list of `v1,<sig>` — a secret being
  // rotated produces more than one. Any match is a pass.
  return signature.split(' ').some((part) => {
    const sig = part.split(',')[1];
    if (!sig) return false;
    const given = Buffer.from(sig);
    if (given.length !== expectedBuf.length) return false;
    return timingSafeEqual(given, expectedBuf);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[clerk-webhook] CLERK_WEBHOOK_SECRET is not set');
    return res.status(503).json({ error: 'Webhook not configured' });
  }
  if (!supabase) {
    console.error('[clerk-webhook] Supabase service client unavailable');
    return res.status(503).json({ error: 'Database not configured' });
  }

  const rawBody = await readRawBody(req);

  if (!verifySvix(rawBody, req.headers, secret)) {
    // Deliberately vague to the caller; the detail goes to the logs.
    console.warn('[clerk-webhook] signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (_) {
    return res.status(400).json({ error: 'Malformed payload' });
  }

  if (event.type !== 'user.deleted') {
    // Acknowledge everything else so Clerk stops retrying it.
    return res.status(200).json({ ok: true, ignored: event.type });
  }

  const userId = event.data && event.data.id;
  if (!userId) return res.status(400).json({ error: 'Missing user id' });

  // list_creators is not listed: it has no user_id and is removed by its own
  // foreign key to lists, which still cascades.
  const owned = [
    ['saved_ideas', 'user_id'],
    ['drafts', 'user_id'],
    ['lists', 'user_id'],
    ['custom_creators', 'user_id'],
    ['profiles', 'id'],
  ];

  const failed = [];
  for (const [table, column] of owned) {
    const { error } = await supabase.from(table).delete().eq(column, userId);
    if (error) {
      console.error(`[clerk-webhook] failed to clear ${table}`, error.message);
      failed.push(table);
    }
  }

  if (failed.length) {
    // 500 makes Clerk retry, which is what we want — a partial delete must not
    // be recorded as a success.
    return res.status(500).json({ error: 'Partial delete', tables: failed });
  }

  console.log(`[clerk-webhook] cleared all rows for ${userId}`);
  return res.status(200).json({ ok: true, deleted: userId });
}
