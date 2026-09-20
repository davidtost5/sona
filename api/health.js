// Health check — and the thing that keeps the database from being paused.
//
// A free Supabase project is paused after roughly a week without activity, and
// "activity" means somebody actually querying it. A marketing site that serves
// static HTML never touches Postgres, so a low-traffic period is enough to get
// the project suspended even though nothing is wrong with it. This endpoint runs
// on a daily cron (see vercel.json) and performs one cheap read, which is all it
// takes to keep the clock reset.
//
// It doubles as a status probe, because the failure this is guarding against is
// invisible until something breaks:
//
//   GET /api/health
//   → 200 { ok: true,  database: { reachable: true,  ... }, config: { ... } }
//   → 503 { ok: false, database: { reachable: false, error } }
//
// The config block reports only WHETHER a secret is set, never its value. Each
// flag is already inferable from how the other endpoints answer (curation
// returns 503 without ADMIN_KEY, a scheduled ingest fails without CRON_SECRET),
// so this exposes nothing new — it just puts the answer in one place, which
// matters when the symptom is "the daily job silently did nothing".

import { supabase } from './_supabase.js';
import { rateLimit, tooMany } from './_rate-limit.js';

// Rows written by the daily ingest are prefixed by source; anything else was
// curated by hand. Freshness of the ingested set is the real signal that the
// scheduled run is working.
const INGEST_PREFIXES = 'id.like.yt\\_%,id.like.sub\\_%';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (tooMany(res, rateLimit(req, 'health', { windowMs: 60_000, perIp: 20, global: 120 }), 60_000,
    'Too many requests.')) return;

  const config = {
    database: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    // Without this the daily ingest cannot authorise itself, so it writes
    // nothing — the failure mode this endpoint exists to make visible.
    cronSecret: Boolean(process.env.CRON_SECRET),
    adminKey: Boolean(process.env.ADMIN_KEY),
  };

  if (!supabase) {
    return res.status(503).json({
      ok: false,
      database: { configured: false, reachable: false, error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' },
      config,
    });
  }

  try {
    // The keepalive itself. head:true asks for the count and no rows, so this
    // stays cheap no matter how large the table gets.
    const total = await supabase.from('outliers').select('id', { count: 'exact', head: true });
    if (total.error) throw total.error;

    const ingested = await supabase
      .from('outliers').select('id', { count: 'exact', head: true }).or(INGEST_PREFIXES);
    if (ingested.error) throw ingested.error;

    const newest = await supabase
      .from('outliers').select('captured_at').or(INGEST_PREFIXES)
      .order('captured_at', { ascending: false }).limit(1);
    if (newest.error) throw newest.error;

    const lastIngestAt = (newest.data && newest.data[0] && newest.data[0].captured_at) || null;
    const ageHours = lastIngestAt
      ? Math.round((Date.now() - new Date(lastIngestAt).getTime()) / 36e5)
      : null;

    // The daily run should never leave the ingested set older than a day or so.
    // Two days of slack absorbs a single missed or slow run before complaining.
    const ingestStale = ageHours === null || ageHours > 48;

    return res.status(200).json({
      ok: true,
      checkedAt: new Date().toISOString(),
      database: {
        configured: true,
        reachable: true,
        outliers: total.count ?? null,
        ingestedOutliers: ingested.count ?? null,
        lastIngestAt,
        lastIngestAgeHours: ageHours,
        ingestStale,
      },
      config,
    });
  } catch (e) {
    // A paused or unreachable project must answer loudly. The cron turning red
    // is the notification.
    const message = (e && e.message) || 'Database query failed';
    console.error('[Health] Database unreachable:', message);
    return res.status(503).json({
      ok: false,
      checkedAt: new Date().toISOString(),
      database: { configured: true, reachable: false, error: message },
      config,
    });
  }
}
