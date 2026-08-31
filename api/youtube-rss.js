// Ingest real YouTube outliers into the Discover feed — with no API key.
//
// WHY THIS EXISTS ALONGSIDE api/youtube.js
// The other ingest needs YOUTUBE_API_KEY: free, but it means a Google Cloud
// project, an enabled API and a key to rotate. This one uses the public RSS
// feed every channel already publishes — no key, no quota, no account.
//
//   https://www.youtube.com/feeds/videos.xml?channel_id=UC...
//
// It returns the 15 most recent videos with view counts and rating counts,
// which is everything the feed renders.
//
// It also produces a HONEST outlier multiple, which the keyed version could
// not. An outlier is only meaningful relative to the channel's own baseline,
// so each video is scored against the median views of those 15. A video with
// 10× the channel's median is a real outlier; raw view count is just channel
// size. That is the number the Discover feed is supposed to be showing.
//
//   GET  ?handles=@AlexHormozi,@ChrisWillx     → preview, writes nothing
//   POST { handles: [...], mode, minMultiple } → writes; needs x-admin-key
//
// Env: none required. ADMIN_KEY only gates the write path.

import { supabase } from './_supabase.js';

const RSS = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const FETCH_TIMEOUT_MS = 9000;

async function get(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} from ${url.slice(0, 60)}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// A handle (@AlexHormozi) is not a channel id. The channel page carries its own
// RSS <link rel="alternate">, and that URL contains the canonical id.
//
// Deliberately NOT matching "channelId":"UC..." — that appears dozens of times
// on the page for recommended channels in the sidebar, and the first hit is
// somebody else's channel. The RSS link is the only occurrence that is
// guaranteed to be this page's own channel.
async function resolveChannelId(handle) {
  const clean = String(handle).trim().replace(/^@/, '');
  if (/^UC[A-Za-z0-9_-]{22}$/.test(clean)) return clean; // already an id

  const html = await get(`https://www.youtube.com/@${encodeURIComponent(clean)}`);
  const m = html.match(/channel_id=(UC[A-Za-z0-9_-]{22})/);
  if (!m) throw new Error(`Could not resolve @${clean} — channel page had no RSS link`);
  return m[1];
}

// The feed is small, well-formed and fixed-shape, so a regex pass beats adding
// an XML parser dependency to a serverless function.
function parseFeed(xml) {
  const author = (xml.match(/<author>\s*<name>(.*?)<\/name>/s) || [])[1] || 'Unknown';
  const entries = [];
  for (const block of xml.match(/<entry>[\s\S]*?<\/entry>/g) || []) {
    const pick = (re) => { const m = block.match(re); return m ? m[1] : null; };
    const views = Number(pick(/views="(\d+)"/) || 0);
    const videoId = pick(/<yt:videoId>(.*?)<\/yt:videoId>/);
    if (!videoId) continue;
    entries.push({
      videoId,
      title: decodeEntities(pick(/<title>([\s\S]*?)<\/title>/) || ''),
      published: pick(/<published>(.*?)<\/published>/),
      views,
      ratings: Number(pick(/count="(\d+)"/) || 0),
    });
  }
  return { author: decodeEntities(author), entries };
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function median(nums) {
  const s = nums.filter((n) => n > 0).sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function compact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

// Channel → the Discover category it belongs in. Unknown channels default to
// creators rather than being dropped, so a new handle still ingests.
function categorise(author) {
  const a = author.toLowerCase();
  if (/hormozi|founder|startup|saas|business|entrepreneur/.test(a)) return 'founders';
  if (/write|author|essay|book|word/.test(a)) return 'writers';
  return 'creators';
}

async function collect(handle, minMultiple) {
  const channelId = await resolveChannelId(handle);
  const { author, entries } = parseFeed(await get(RSS + channelId));
  if (!entries.length) return { handle, channelId, author, baseline: 0, rows: [], considered: 0 };

  const baseline = median(entries.map((e) => e.views));
  const bare = String(handle).trim().replace(/^@/, '');

  const rows = entries
    .map((e) => ({ ...e, multiple: baseline ? e.views / baseline : 0 }))
    .filter((e) => e.multiple >= minMultiple && e.views > 0)
    .sort((a, b) => b.multiple - a.multiple)
    .map((e, idx) => ({
      id: `yt_${slug(bare)}_${e.videoId}`,
      cat: categorise(author),
      creator_name: author,
      handle: `@${bare} · YouTube`,
      avatar_handle: bare,
      text: e.title,
      outlier_tag: `${e.multiple.toFixed(1)}× outlier`,
      views: `${compact(e.views)} views`,
      source_url: `https://www.youtube.com/watch?v=${e.videoId}`,
      media_type: 'video',
      thumb_url: `https://i.ytimg.com/vi/${e.videoId}/hqdefault.jpg`,
      duration: null,        // not in the RSS feed; left null rather than faked
      likes: e.ratings ? compact(e.ratings) : null,
      reposts: null,
      position: idx,
    }));

  return { handle, channelId, author, baseline, considered: entries.length, rows };
}

export default async function handler(req, res) {
  // Eight channels publish a few videos a day between them, and a video only
  // becomes an outlier once it beats its channel's median — which takes days.
  // Genuine daily turnover is a function of how many creators are watched, so
  // the default list is wide rather than tidy.
  // Every handle here was checked to resolve; four candidates (@ThePeterAttiaDrive,
  // @AliAbdaalPodcast, @TheColinandSamirShow, @nathanielldrew) 404 on YouTube and
  // were dropped rather than shipped as silent failures in the daily run.
  const DEFAULT_HANDLES = [
    'AlexHormozi', 'ChrisWillx', 'gregisenberg', 'aliabdaal', 'MyFirstMillionPod',
    'ycombinator', 'ThomasFrank', 'ImanGadzhi', 'lexfridman', 'GaryVee',
    'noahkagan', 'NathanBarry', 'FinancialTimes', 'MattDAvella', 'StartupIdeasPod',
  ].join(',');
  const raw =
    req.query.handles ||
    (req.body && req.body.handles) ||
    // A cron request has no query string; INGEST_HANDLES is how the daily run
    // is configured without redeploying.
    process.env.INGEST_HANDLES ||
    DEFAULT_HANDLES;
  const handles = (Array.isArray(raw) ? raw : String(raw).split(','))
    .map((h) => String(h).trim()).filter(Boolean).slice(0, 40);

  if (!handles.length) {
    return res.status(400).json({
      error: 'Pass ?handles=@name,@name (or set INGEST_HANDLES)',
    });
  }

  const minMultiple = Number(
    req.query.minMultiple || (req.body && req.body.minMultiple) || 1.8
  );

  // Channels are fetched in parallel batches, not one after another. Sequential
  // took 4.8s for eight handles, and Vercel caps a function at 10s — so the old
  // loop hit the ceiling at roughly sixteen channels. Since "something new every
  // day" is a function of how many creators are watched, that ceiling was the
  // real constraint on the feature, not the ingest logic.
  //
  // Batched rather than one big Promise.all: forty simultaneous requests to
  // YouTube is a good way to start getting rate-limited or blocked.
  const CONCURRENCY = 6;
  const results = [];
  const failed = [];
  for (let i = 0; i < handles.length; i += CONCURRENCY) {
    const batch = handles.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((h) => collect(h, minMultiple))
    );
    settled.forEach((r, idx) => {
      // One dead handle must not lose the rest of the batch.
      if (r.status === 'fulfilled') results.push(r.value);
      else failed.push({ handle: batch[idx], error: r.reason.message });
    });
  }

  const rows = results.flatMap((r) => r.rows);

  // Vercel Cron invokes with GET and an Authorization bearer, not a POST with
  // the admin key, so the daily run is authorised on that instead. Everything
  // else about a cron run is a normal write.
  const cronSecret = process.env.CRON_SECRET;
  const isCron = Boolean(
    cronSecret && req.headers.authorization === `Bearer ${cronSecret}`
  );

  // GET previews. Nothing is written until an authenticated POST — or a cron.
  if (req.method !== 'POST' && !isCron) {
    return res.status(200).json({
      preview: true,
      minMultiple,
      channels: results.map(({ rows: r, ...rest }) => ({ ...rest, wouldWrite: r.length })),
      failed,
      rows,
    });
  }

  if (!isCron) {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || req.headers['x-admin-key'] !== adminKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });
  if (!rows.length) {
    return res.status(200).json({ written: 0, note: 'Nothing cleared the threshold', failed });
  }

  // Replace mode deletes only this endpoint's own rows (id prefix yt_), so a
  // curated hand-picked feed is never wiped by an ingest run.
  const mode = (req.query.mode || (req.body && req.body.mode) || 'append').toLowerCase();
  if (mode === 'replace') {
    const { error } = await supabase.from('outliers').delete().like('id', 'yt\\_%');
    if (error) return res.status(500).json({ error: 'Clear failed: ' + error.message });
  }

  const { error } = await supabase.from('outliers').upsert(rows, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: 'Write failed: ' + error.message });

  return res.status(200).json({ written: rows.length, mode, minMultiple, failed });
}
