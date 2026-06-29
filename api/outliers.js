// Curate the Discover feed — the `outliers` table the /app reads from.
//
// GET  → list current outliers (public catalog, no secret).
// POST → replace or append the feed. Requires:
//   - header `x-admin-key` matching env ADMIN_KEY
//   - env SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service-role bypasses RLS)
//
// Body: { mode: 'replace' | 'append', items: [ { creator_name, handle, text,
//          avatar_handle?, outlier_tag?, views?, cat?, source_url?, position? } ] }
//
// This is the daily-refresh tool: paste the day's set in /admin → Publish.
// Curation is human (your taste) — no scraping, no AI writing.

import { supabase } from './_supabase.js';
import crypto from 'crypto';

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
}

export default async function handler(req, res) {
  const adminKey = process.env.ADMIN_KEY;

  // ── READ (public — it's a shared catalog, same data the app reads) ──
  if (req.method === 'GET') {
    if (!supabase) return res.status(200).json({ items: [] });
    const { data, error } = await supabase
      .from('outliers').select('*')
      .order('position', { ascending: true })
      .order('captured_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ items: data || [] });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── WRITE (admin only) ──
  if (!adminKey) return res.status(503).json({ error: 'Curation disabled: set ADMIN_KEY in the environment.' });
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' });
  if (!safeEqual(req.headers['x-admin-key'] || '', adminKey)) {
    return res.status(401).json({ error: 'Invalid admin key.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const mode = body && body.mode === 'append' ? 'append' : 'replace';
  const itemsIn = body && Array.isArray(body.items) ? body.items : [];
  if (!itemsIn.length) return res.status(400).json({ error: 'No outliers provided.' });

  const now = Date.now();
  const rows = [];
  for (let i = 0; i < itemsIn.length; i++) {
    const it = itemsIn[i] || {};
    const creator = String(it.creator_name || it.name || '').trim();
    const handle = String(it.handle || '').trim();
    const text = String(it.text || '').trim();
    if (!creator || !handle || !text) {
      return res.status(400).json({ error: `Row ${i + 1}: creator, handle and text are all required.` });
    }
    const cat = ['founders', 'writers', 'creators'].includes(it.cat) ? it.cat : 'founders';
    const avatar = String(it.avatar_handle || handle.replace(/^@/, '').split(/[\s·]/)[0] || '').trim();
    rows.push({
      id: it.id || `o_${slugify(creator)}_${(now + i).toString(36)}`,
      cat,
      creator_name: creator,
      handle,
      avatar_handle: avatar || null,
      text,
      outlier_tag: String(it.outlier_tag || it.tag || '').trim() || null,
      views: String(it.views || '').trim() || null,
      source_url: String(it.source_url || '').trim() || null,
      position: Number.isFinite(+it.position) ? +it.position : i,
    });
  }

  try {
    if (mode === 'replace') {
      const { error: delErr } = await supabase.from('outliers').delete().neq('id', '');
      if (delErr) throw delErr;
    }
    const { error: insErr } = await supabase.from('outliers').upsert(rows, { onConflict: 'id' });
    if (insErr) throw insErr;
    return res.status(200).json({ ok: true, mode, count: rows.length });
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || 'Write failed.' });
  }
}
