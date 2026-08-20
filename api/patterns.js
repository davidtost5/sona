// GET /api/patterns — the Pattern Library.
//
// Every decode that has ever run is already sitting in `post_decodes`, but it's
// only ever shown once, in a modal, and then forgotten. This endpoint aggregates
// that cache: it groups every decode by its hook type so you can see which
// mechanisms actually recur across breakout posts — and, where the decoded post
// is still in the Discover catalog, which real outliers used each one.
//
// This is the part Eden has no equivalent of. Their model is capture-and-organize;
// this is mechanism-analysis over a corpus. It also costs nothing extra to run:
// the decodes were already paid for by /api/decode's write-through cache.
//
// Read-only and public — same posture as /api/outliers, since it exposes the same
// shared catalog, never per-user data.

import { supabase } from './_supabase.js';
import { createHash } from 'crypto';

// Must match /api/decode's key derivation exactly, or the join finds nothing.
function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

// Hook labels come back from the model as free text ("Contrarian counter",
// "contrarian  counter"), so fold case and whitespace for the grouping key while
// keeping a human-readable label for display.
function groupKey(hook) {
  return String(hook || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Not configured — return an empty library rather than an error, so the view
  // renders its empty state instead of breaking.
  if (!supabase) return res.status(200).json({ patterns: [], totalDecodes: 0 });

  const { data: decodes, error } = await supabase
    .from('post_decodes')
    .select('id, decoded, created_at')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  if (!decodes || !decodes.length) {
    return res.status(200).json({ patterns: [], totalDecodes: 0 });
  }

  // Attach real source posts where we still have them. The decode cache is keyed
  // by sha256(text), so hashing each outlier's text tells us which decode it produced.
  const byHash = new Map();
  const { data: outliers } = await supabase
    .from('outliers')
    .select('creator_name, handle, text, outlier_tag, views, source_url, cat');

  for (const o of outliers || []) {
    if (o && o.text) byHash.set(sha256(String(o.text).trim()), o);
  }

  const groups = new Map();

  for (const row of decodes) {
    const d = row && row.decoded;
    if (!d || !d.hook) continue;

    const key = groupKey(d.hook);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, { hook: d.hook, count: 0, templates: [], examples: [] });
    }
    const g = groups.get(key);
    g.count += 1;

    // Templates are the reusable payload — dedupe so one popular post doesn't
    // fill the card with the same line repeated.
    if (d.pattern && !g.templates.includes(d.pattern) && g.templates.length < 4) {
      g.templates.push(d.pattern);
    }

    const src = byHash.get(row.id);
    if (src && g.examples.length < 3) {
      g.examples.push({
        creator_name: src.creator_name,
        handle: src.handle,
        text: src.text,
        outlier_tag: src.outlier_tag,
        views: src.views,
        source_url: src.source_url,
        cat: src.cat,
      });
    }

    // Keep one representative explanation per group for the "why it works" line.
    if (!g.why && d.why) g.why = d.why;
    if (!g.tension && d.tension) g.tension = d.tension;
  }

  // Recurring mechanisms first — a pattern seen once isn't yet a pattern.
  const patterns = [...groups.values()].sort((a, b) => b.count - a.count);

  return res.status(200).json({ patterns, totalDecodes: decodes.length });
}
