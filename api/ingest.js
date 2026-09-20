// Ingest real outliers into the Discover feed — with no API keys.
//
// Two sources, both free and unauthenticated:
//
//   YouTube   the public RSS feed every channel publishes. 15 recent videos
//             with view counts.
//               https://www.youtube.com/feeds/videos.xml?channel_id=UC...
//
//   Substack  the archive JSON every publication exposes. Carries
//             reaction_count, restacks, comment_count and wordcount.
//               https://<pub>.substack.com/api/v1/archive?sort=new
//
//             Note the RSS feed is NOT usable here: it has no engagement data
//             at all, so there is nothing to compute a multiple from. The words
//             "like" and "restack" appear in it only as button labels.
//
//   Notes     the same publication's short posts, from the public reader feed.
//               https://substack.com/api/v1/reader/feed/profile/<user_id>
//
//             Articles and notes are two different games — a note is the bare
//             hook with nothing to hide behind — so they are collected
//             separately and each scored against its own kind.
//
// All three score a post against its own author's median rather than an
// absolute number, because an outlier is only meaningful relative to a
// baseline. 10x a channel's median is a real outlier; a big raw number is just
// a big account.
//
//   GET  ?handles=@a,@b&substacks=x,y&notes=x,y  → preview, writes nothing
//   POST same + x-admin-key                      → writes
//   GET  with a Vercel Cron bearer                → writes (the daily run)
//
// Env: ADMIN_KEY gates manual writes, CRON_SECRET the scheduled one,
// INGEST_HANDLES / INGEST_SUBSTACKS / INGEST_SUBSTACK_NOTES configure the
// daily run.

import { supabase } from './_supabase.js';

const RSS = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const SUBSTACK_API = 'https://substack.com/api/v1';
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

async function getJson(url) {
  const body = await get(url);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Expected JSON from ${url.slice(0, 60)}, got ${body.slice(0, 40)}`);
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

// Substack prints a read time on every post in its own app, and readers use it
// to decide whether to open something. The API does not carry that string, but
// it does carry wordcount, and 250 wpm reproduces what Substack shows on five
// of the six posts checked against a live publication — the sixth reads one
// minute longer there, because embedded media counts toward their estimate and
// not toward the word count.
export function readTime(words) {
  const w = Number(words) || 0;
  if (w <= 0) return null;
  return `${Math.max(1, Math.ceil(w / 250))} min read`;
}

// Notes carry line breaks and no title, so the whole body is the post. Long
// ones are capped: a feed card is a reason to open the original, not a reader.
export function noteText(body) {
  const clean = String(body || '').replace(/\n{3,}/g, '\n\n').trim();
  return clean.length > 700 ? `${clean.slice(0, 697).trimEnd()}…` : clean;
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
      posted_at: e.published || null,
      position: idx,
    }));

  return { handle, channelId, author, baseline, considered: entries.length, rows };
}

// Substack: same question as YouTube, different metric. Reactions stand in for
// views because they are what the archive exposes, and a post is an outlier
// when it beat its own publication's median.
async function collectSubstack(pub, minMultiple) {
  const name = String(pub).trim().replace(/^@/, '').replace(/\.substack\.com$/, '');
  const url = `https://${encodeURIComponent(name)}.substack.com/api/v1/archive?sort=new&limit=24`;
  const posts = await getJson(url);
  if (!Array.isArray(posts) || !posts.length) {
    return { handle: '@' + name, author: name, baseline: 0, considered: 0, rows: [] };
  }

  const byline = (posts[0].publishedBylines || [])[0] || {};
  const author = byline.name || name;
  // The publication is a separate identity from the writer — "Stijn Noorman"
  // publishes "The Stoic Solopreneur" — and Substack shows both, so both are
  // kept instead of collapsing them into a handle.
  const publication =
    ((byline.publicationUsers || []).find((u) => u.publication) || {}).publication?.name || null;
  const baseline = median(posts.map((p) => p.reaction_count || 0));

  const rows = posts
    .map((p) => ({ p, multiple: baseline ? (p.reaction_count || 0) / baseline : 0 }))
    .filter(({ p, multiple }) => multiple >= minMultiple && (p.reaction_count || 0) > 0)
    .sort((a, b) => b.multiple - a.multiple)
    .map(({ p, multiple }, idx) => ({
      id: `sub_${slug(name)}_${slug(p.slug || String(p.id))}`,
      cat: 'writers',                       // Substack is the writers source
      creator_name: author,
      handle: `@${name} · Substack`,
      avatar_handle: byline.handle || name,
      // Subtitle carries the actual argument more often than the title does.
      text: p.subtitle ? `${p.title} — ${p.subtitle}` : p.title,
      outlier_tag: `${multiple.toFixed(1)}× outlier`,
      views: `${compact(p.reaction_count || 0)} reactions`,
      source_url: p.canonical_url || `https://${name}.substack.com/p/${p.slug}`,
      media_type: p.cover_image ? 'image' : null,
      thumb_url: p.cover_image || null,
      duration: null,
      likes: compact(p.reaction_count || 0),
      reposts: p.restacks ? compact(p.restacks) : null,
      comments: p.comment_count ? compact(p.comment_count) : null,
      read_time: readTime(p.wordcount),
      // unavatar.io guesses an avatar from an X handle, which is wrong for a
      // writer who only publishes on Substack. The byline carries the real one.
      avatar_url: byline.photo_url || null,
      publication,
      posted_at: p.post_date || null,
      position: idx,
    }));

  return { handle: '@' + name, author, publication, baseline, considered: posts.length, rows };
}

// Substack Notes — the short posts, scored exactly like the articles but
// against other notes, since a note that beats a 3,000-word essay on likes has
// not beaten anything comparable.
//
// The reader feed is public and needs no key, but it is keyed by numeric user
// id rather than handle, which the public profile endpoint resolves.
const MIN_NOTES = 6;

async function collectSubstackNotes(handleRaw, minMultiple) {
  const handle = String(handleRaw).trim().replace(/^@/, '').replace(/\.substack\.com$/, '');
  const profile = await getJson(
    `${SUBSTACK_API}/user/${encodeURIComponent(handle)}/public_profile`
  );
  if (!profile || !profile.id) throw new Error(`No Substack profile for @${handle}`);

  const feed = await getJson(
    `${SUBSTACK_API}/reader/feed/profile/${profile.id}?types%5B%5D=note&limit=24`
  );

  // A profile feed also carries the notes this person restacked from somebody
  // else. Those are not their posts and must not be scored as theirs.
  const notes = (feed.items || [])
    .map((item) => item.comment)
    .filter((c) => c && c.body && c.user_id === profile.id);

  const author = profile.name || handle;
  const publication =
    (profile.primaryPublication && profile.primaryPublication.name) ||
    ((profile.publicationUsers || []).find((u) => u.publication) || {}).publication?.name ||
    null;

  // Six is the floor for a baseline. With two or three notes the median is
  // effectively one of the posts being scored, so everything lands near 1.0×
  // and the feed fills with posts that did not actually break out.
  if (notes.length < MIN_NOTES) {
    return {
      handle: `@${handle}`, author, publication, baseline: 0, considered: notes.length, rows: [],
      note: `Only ${notes.length} notes — need ${MIN_NOTES} for a baseline`,
    };
  }

  const baseline = median(notes.map((c) => c.reaction_count || 0));

  const rows = notes
    .map((c) => ({ c, multiple: baseline ? (c.reaction_count || 0) / baseline : 0 }))
    .filter(({ c, multiple }) => multiple >= minMultiple && (c.reaction_count || 0) > 0)
    .sort((a, b) => b.multiple - a.multiple)
    .map(({ c, multiple }, idx) => ({
      id: `note_${slug(handle)}_${c.id}`,
      cat: 'writers',
      creator_name: c.name || author,
      handle: `@${handle} · Substack`,
      avatar_handle: handle,
      text: noteText(c.body),
      outlier_tag: `${multiple.toFixed(1)}× outlier`,
      views: `${compact(c.reaction_count || 0)} likes`,
      source_url: `https://substack.com/@${handle}/note/c-${c.id}`,
      // 'note' rather than 'image': a note is text that is meant to be read as
      // written, line breaks and all, so the app renders it as a quote card.
      media_type: 'note',
      thumb_url: null,
      duration: null,
      likes: compact(c.reaction_count || 0),
      reposts: c.restacks ? compact(c.restacks) : null,
      comments: c.children_count ? compact(c.children_count) : null,
      read_time: null,
      avatar_url: c.photo_url || profile.photo_url || null,
      publication: (c.user_primary_publication && c.user_primary_publication.name) || publication,
      posted_at: c.date || null,
      position: idx,
    }));

  return { handle: `@${handle}`, author, publication, baseline, considered: notes.length, rows };
}

// Columns added by migration-outliers-substack.sql. Two things depend on this
// list, and both are failure modes that were easy to hit:
//
//   PostgREST rejects a bulk insert outright when the objects do not all carry
//   the same keys, so a YouTube row with no read time next to a Substack row
//   with one fails the whole batch. Every row is padded to the same shape.
//
//   A deploy that lands before the migration runs would otherwise fail on the
//   unknown column and write nothing at all — including the YouTube rows that
//   have nothing to do with the new fields. In that case the write is retried
//   without them, and the response says the migration is outstanding.
const SUBSTACK_COLUMNS = ['comments', 'read_time', 'avatar_url', 'publication', 'posted_at'];
const ROW_COLUMNS = [
  'id', 'cat', 'creator_name', 'handle', 'avatar_handle', 'text', 'outlier_tag', 'views',
  'source_url', 'media_type', 'thumb_url', 'duration', 'likes', 'reposts', 'position',
  ...SUBSTACK_COLUMNS,
];

export function normaliseRow(row) {
  const out = {};
  for (const key of ROW_COLUMNS) out[key] = row[key] === undefined ? null : row[key];
  return out;
}

// Writes, giving up one thing at a time when the schema has not caught up.
// Each fallback is narrower than failing the batch, which would also take down
// the YouTube rows that have nothing to do with the new fields.
async function upsertOutliers(rows) {
  const gaveUp = [];
  let payload = rows;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await supabase.from('outliers').upsert(payload, { onConflict: 'id' });
    if (!error) return { error: null, gaveUp };

    if (SUBSTACK_COLUMNS.some((column) => error.message.includes(column))) {
      payload = payload.map((row) => {
        const copy = { ...row };
        for (const column of SUBSTACK_COLUMNS) delete copy[column];
        return copy;
      });
      gaveUp.push(`read time, comments, publication, avatar and post date (columns missing)`);
      continue;
    }

    // The original media_type constraint allows only 'image' and 'video'.
    if (error.message.includes('outliers_media_type_check')) {
      payload = payload.map((row) =>
        row.media_type === 'note' ? { ...row, media_type: null } : row);
      gaveUp.push('the note card shape (media_type check does not allow \'note\' yet)');
      continue;
    }

    return { error, gaveUp };
  }

  return { error: new Error('Write still failed after dropping the new columns'), gaveUp };
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

  // Substack fills the writers category, which YouTube barely touches — its
  // channels categorise almost entirely as creators.
  // Verified to return a real archive with reaction counts. Dropped:
  // lennysnewsletter and thebrowser (no archive JSON), every / stratechery /
  // creatorscience (1-2 posts, so the median is the post itself and every
  // multiple comes out 1.0x — a baseline of one is not a baseline).
  const DEFAULT_SUBSTACKS =
    'thedankoe,oneusefulthing,platformer,noahpinion,astralcodexten,thegeneralist,garyvee,sahilbloom,dickiebush,stijnnoorman';
  const rawSubs =
    req.query.substacks ||
    (req.body && req.body.substacks) ||
    process.env.INGEST_SUBSTACKS ||
    DEFAULT_SUBSTACKS;
  const substacks = (Array.isArray(rawSubs) ? rawSubs : String(rawSubs).split(','))
    .map((h) => String(h).trim()).filter(Boolean).slice(0, 20);

  // Notes are keyed by the writer's Substack handle, not the publication
  // subdomain, and the two are not always the same string — every handle below
  // was checked against the public profile endpoint and has enough notes to
  // build a baseline from. oneusefulthing (2 notes), noahpinion (4), garyvee
  // and davidperell (0) are deliberately absent: they publish articles, which
  // the archive pass above already covers.
  const DEFAULT_NOTES = 'thedankoe,platformer,astralcodexten,sahilbloom,dickiebush,stijnnoorman';
  const rawNotes =
    req.query.notes ||
    (req.body && req.body.notes) ||
    process.env.INGEST_SUBSTACK_NOTES ||
    DEFAULT_NOTES;
  const noteHandles = (Array.isArray(rawNotes) ? rawNotes : String(rawNotes).split(','))
    .map((h) => String(h).trim()).filter(Boolean).slice(0, 20);

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

  // One queue for both sources so the batching and the 10s budget are shared.
  const jobs = [
    ...handles.map((h) => ({ label: h, run: () => collect(h, minMultiple) })),
    ...substacks.map((p) => ({ label: p + ' (substack)', run: () => collectSubstack(p, minMultiple) })),
    ...noteHandles.map((h) => ({
      label: h + ' (notes)', run: () => collectSubstackNotes(h, minMultiple),
    })),
  ];
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((j) => j.run()));
    settled.forEach((r, idx) => {
      // One dead source must not lose the rest of the batch.
      if (r.status === 'fulfilled') results.push(r.value);
      else failed.push({ handle: batch[idx].label, error: r.reason.message });
    });
  }

  const rows = results.flatMap((r) => r.rows).map(normaliseRow);

  // Vercel Cron invokes with GET and an Authorization bearer, not a POST with
  // the admin key, so the daily run is authorised on that instead. Everything
  // else about a cron run is a normal write.
  const cronSecret = process.env.CRON_SECRET;
  const isCron = Boolean(
    cronSecret && req.headers.authorization === `Bearer ${cronSecret}`
  );

  // Vercel labels its own invocations with this user agent and header. They are
  // detection only — the bearer above stays the security boundary, since either
  // can be forged by anyone. Knowing a request was MEANT to be the daily run is
  // what lets an unauthorised one fail loudly instead of quietly previewing.
  const looksLikeCron = Boolean(
    req.headers['x-vercel-cron-schedule'] ||
    /^vercel-cron\//.test(String(req.headers['user-agent'] || ''))
  );

  // A scheduled run that cannot authorise used to fall straight through to the
  // preview below and answer 200, so an unset CRON_SECRET looked like a healthy
  // daily job while nothing was ever written — the feed went stale and the
  // database sat idle long enough to be scheduled for pausing. Refuse instead,
  // so the cron goes red and says why.
  if (looksLikeCron && !isCron) {
    const reason = cronSecret
      ? 'CRON_SECRET is set but the Authorization header did not match it'
      : 'CRON_SECRET is not set, so Vercel sends no Authorization header to compare';
    console.error(`[Ingest] Scheduled run refused: ${reason}. Nothing was written.`);
    return res.status(500).json({ error: 'Scheduled run not authorised', reason, written: 0 });
  }

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
    // Touch the database even on an empty day. A scheduled run that returns
    // without querying leaves a free Supabase project looking idle, and idle
    // projects get paused.
    const { count } = await supabase.from('outliers').select('id', { count: 'exact', head: true });
    return res.status(200).json({
      written: 0, note: 'Nothing cleared the threshold', outliers: count ?? null, failed,
    });
  }

  // Replace mode deletes only this endpoint's own rows (id prefixes yt_, sub_
  // and note_), so a curated hand-picked feed is never wiped by an ingest run.
  const mode = (req.query.mode || (req.body && req.body.mode) || 'append').toLowerCase();
  if (mode === 'replace') {
    const { error } = await supabase
      .from('outliers')
      .delete()
      .or('id.like.yt\\_%,id.like.sub\\_%,id.like.note\\_%');
    if (error) return res.status(500).json({ error: 'Clear failed: ' + error.message });
  }

  const { error, gaveUp } = await upsertOutliers(rows);
  if (error) return res.status(500).json({ error: 'Write failed: ' + error.message });

  if (gaveUp.length) {
    console.warn(
      `[Ingest] Wrote ${rows.length} rows but gave up ${gaveUp.join('; ')} — ` +
      'run migration-outliers-substack.sql.'
    );
  }

  return res.status(200).json({
    written: rows.length,
    mode,
    minMultiple,
    failed,
    ...(gaveUp.length
      ? { degraded: `Run migration-outliers-substack.sql — wrote without ${gaveUp.join('; ')}` }
      : {}),
  });
}
