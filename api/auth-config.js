// Returns the *public* Supabase config to the browser so auth.js can initialize.
// SUPABASE_ANON_KEY is designed to be exposed client-side — it's protected by
// Row-Level-Security policies you set in the Supabase dashboard.
//
// To enable: add SUPABASE_ANON_KEY to Vercel env vars
// (Supabase dashboard → Project Settings → API → "anon public" key).

export default function handler(req, res) {
  // Don't cache — env vars can change behind this and we need every page load
  // to see the current truth. The payload is tiny (~150 bytes), no CDN savings worth a stale-config bug.
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const url = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';

  return res.status(200).json({
    url,
    anonKey,
    configured: Boolean(url && anonKey),
  });
}
