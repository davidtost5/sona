// Returns the real number of founding-member seats claimed.
// Reads from a `founding_members` table in Supabase (created via the Stripe webhook).
//
// If the table doesn't exist yet (i.e. you haven't wired the webhook), this gracefully
// returns 0 — which is the truth. No fake numbers anywhere.

import { supabase } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

  if (!supabase) {
    return res.status(200).json({ claimed: 0, total: 100 });
  }

  try {
    const { count, error } = await supabase
      .from('founding_members')
      .select('*', { count: 'exact', head: true });
    if (error) return res.status(200).json({ claimed: 0, total: 100 });
    return res.status(200).json({ claimed: count || 0, total: 100 });
  } catch (_) {
    return res.status(200).json({ claimed: 0, total: 100 });
  }
}
