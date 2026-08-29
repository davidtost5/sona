// Ingest real YouTube videos from entrepreneur channels into the Discover feed.
//
// GET  ?handles=@AlexHormozi,@ChrisWillx  → preview what would be ingested (no write)
// POST { handles: [...], mode: 'append'|'replace', perChannel: 3 }
//        → writes to the `outliers` table. Requires header `x-admin-key`.
//
// Why this exists: the feed's credibility depends on real numbers. YouTube's Data
// API is free (10k quota units/day) and returns actual view counts, so the
// "N× outlier" tag is computed — video views ÷ that channel's median views —
// not guessed. Roughly 3 quota units per channel, so a daily refresh of 30
// channels costs ~90 units.
//
// Env: YOUTUBE_API_KEY (free, Google Cloud console → YouTube Data API v3)
//      ADMIN_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (for writes)

import { supabase } from './_supabase.js';
import crypto from 'crypto';

const API = 'https://www.googleapis.com/youtube/v3';

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function compactViews(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M views`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}K views`;
  return `${v} views`;
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function ytFetch(path, params, key) {
  const qs = new URLSearchParams({ ...params, key }).toString();
  const res = await fetch(`${API}/${path}?${qs}`);
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message || `YouTube API ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

// One channel → its best recent videos, with a real outlier multiplier.
async function collectChannel(handle, key, perChannel) {
  const clean = String(handle).trim().replace(/^@/, '');
  if (!clean) return [];
  // Basic validation: should be alphanumeric with possible hyphens/underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) {
    console.warn(`Invalid YouTube handle format: ${handle}`);
    return [];
  }

  // 1. Resolve handle → uploads playlist + channel meta
  const ch = await ytFetch('channels', {
    part: 'snippet,contentDetails',
    forHandle: `@${clean}`,
  }, key);
  const channel = ch.items && ch.items[0];
  if (!channel) return [];

  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return [];
  const channelTitle = channel.snippet?.title || clean;
  // The channel's real avatar. Falls back to the handle, which the app resolves
  // via unavatar — but that looks up X, so a YouTube-only creator would miss.
  const channelAvatar = channel.snippet?.thumbnails?.high?.url
    || channel.snippet?.thumbnails?.medium?.url
    || channel.snippet?.thumbnails?.default?.url
    || '';

  // 2. Recent uploads (25 is enough to establish a median baseline)
  const pl = await ytFetch('playlistItems', {
    part: 'contentDetails',
    playlistId: uploads,
    maxResults: '25',
  }, key);
  const ids = (pl.items || []).map(i => i.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return [];

  // 3. Stats for those videos
  const vids = await ytFetch('videos', {
    part: 'snippet,statistics,contentDetails',
    id: ids.join(','),
  }, key);

  const all = (vids.items || []).map(v => ({
    videoId: v.id,
    title: v.snippet?.title || '',
    publishedAt: v.snippet?.publishedAt || null,
    thumb: v.snippet?.thumbnails?.maxres?.url
        || v.snippet?.thumbnails?.high?.url
        || v.snippet?.thumbnails?.medium?.url || '',
    views: Number(v.statistics?.viewCount || 0),
    duration: v.contentDetails?.duration || '',
  })).filter(v => v.views > 0);

  if (!all.length) return [];

  // Real outlier math: this video vs. the channel's own median.
  const base = median(all.map(v => v.views)) || 1;

  return all
    .sort((a, b) => b.views - a.views)
    .slice(0, Math.max(1, Math.min(perChannel, 10)))
    .map(v => {
      const mult = v.views / base;
      return {
        id: `yt_${v.videoId}`,
        media_type: 'video',
        cat: 'creators',
        creator_name: channelTitle,
        handle: `@${clean} · YouTube`,
        avatar_handle: channelAvatar || clean,
        text: v.title,
        outlier_tag: mult >= 1.5 ? `${mult.toFixed(1).replace(/\.0$/, '')}× outlier` : null,
        views: compactViews(v.views),
        source_url: `https://www.youtube.com/watch?v=${v.videoId}`,
        video_id: v.videoId,
        thumbnail_url: v.thumb,
        published_at: v.publishedAt,
      };
    });
}

export default async function handler(req, res) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: 'YouTube ingest disabled: set YOUTUBE_API_KEY in the environment.',
    });
  }

  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const raw = req.method === 'POST' ? body.handles : (req.query.handles || '');
  const handles = (Array.isArray(raw) ? raw : String(raw).split(','))
    .map(h => String(h).trim())
    .filter(Boolean)
    .slice(0, 40); // quota guard

  if (!handles.length) {
    return res.status(400).json({ error: 'Provide ?handles=@one,@two (or a handles array in the body).' });
  }

  const perChannel = Math.max(1, Math.min(Number(body.perChannel || req.query.perChannel || 2), 10));

  let items = [];
  const failed = [];
  for (const h of handles) {
    try {
      const got = await collectChannel(h, key, perChannel);
      items = items.concat(got);
    } catch (e) {
      failed.push({ handle: h, error: (e && e.message) || 'failed' });
    }
  }

  // GET = dry run so you can eyeball the batch before it goes live.
  if (req.method === 'GET') {
    return res.status(200).json({ preview: true, count: items.length, items, failed });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── WRITE (admin only) ──
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return res.status(503).json({ error: 'Writes disabled: set ADMIN_KEY.' });
  if (!safeEqual(req.headers['x-admin-key'] || '', adminKey)) {
    return res.status(401).json({ error: 'Invalid admin key.' });
  }
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured.' });
  if (!items.length) return res.status(400).json({ error: 'Nothing to write.', failed });

  try {
    if (body.mode === 'replace') {
      const { error: delErr } = await supabase.from('outliers').delete().eq('media_type', 'video');
      if (delErr) throw delErr;
    }
    const rows = items.map((it, i) => ({ ...it, position: 100 + i })); // videos sort after posts by default
    const { error: insErr } = await supabase.from('outliers').upsert(rows, { onConflict: 'id' });
    if (insErr) throw insErr;
    return res.status(200).json({ ok: true, count: rows.length, failed });
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || 'Write failed.', failed });
  }
}
