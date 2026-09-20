// Resolve a link into a real post — the "paste anything" half of Discover.
//
// The ingest cron watches a fixed list of creators. This is the other
// direction: somebody sends you a link, and Sona should be able to pull the
// actual post behind it — its numbers, its author, how far it beat that
// author's own median — instead of asking you to retype the text.
//
//   GET /api/resolve?url=https://youtu.be/8-q3ClOYoyA
//   GET /api/resolve?url=https://garyvee.substack.com/p/document-dont-create
//   GET /api/resolve?url=https://substack.com/@thedankoe/note/c-336554742
//
// Answers a row in exactly the shape the Discover feed and `outliers` table
// use, so a resolved link renders, decodes and links out like any other card.
//
// Three sources, all public and unauthenticated:
//
//   YouTube          oEmbed for the title and channel, then the channel's RSS
//                    feed for view counts and the median to score against.
//   Substack post    /api/v1/posts/<slug> on the publication's own host, plus
//                    its archive for the publication median.
//   Substack note    /api/v1/reader/comment/<id>, plus that writer's note feed
//                    for the median. Notes are scored against notes.
//
// No API keys. Nothing is written — resolving a link is a read.

import dns from 'node:dns/promises';
import net from 'node:net';
import { rateLimit, tooMany } from './_rate-limit.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const FETCH_TIMEOUT_MS = 8000;
const SUBSTACK_API = 'https://substack.com/api/v1';
const RSS = 'https://www.youtube.com/feeds/videos.xml?channel_id=';

// A Substack publication is usually reachable on its own domain
// (letters.thedankoe.com), so the host cannot be allow-listed the way
// youtube.com can. Any host is therefore checked for two things before it is
// fetched: it must not be an IP literal, and it must not resolve into a
// private range. Without that, this endpoint is an open door to anything
// inside the deployment's network that answers HTTP.
const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal']);

export function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;       // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    return false;
  }
  const ip = address.toLowerCase();
  return ip === '::1' || ip === '::' || ip.startsWith('fc') || ip.startsWith('fd') ||
    ip.startsWith('fe80') || ip.startsWith('::ffff:');
}

async function assertPublicHost(hostname) {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('That host is not reachable from here');
  }
  if (net.isIP(host)) throw new Error('Send a link, not an IP address');

  let records;
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new Error(`Could not find ${host}`);
  }
  if (records.some((r) => isPrivateAddress(r.address))) {
    throw new Error('That host is not reachable from here');
  }
}

async function get(url) {
  const target = new URL(url);
  if (target.protocol !== 'https:') throw new Error('Links must be https');
  await assertPublicHost(target.hostname);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target, { headers: { 'user-agent': UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} from ${target.host}`);
    return await res.text();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`${target.host} took too long to answer`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url) {
  const body = await get(url);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${new URL(url).host} did not answer with JSON`);
  }
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

function readTime(words) {
  const w = Number(words) || 0;
  return w > 0 ? `${Math.max(1, Math.ceil(w / 250))} min read` : null;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function noteText(body) {
  const clean = String(body || '').replace(/\n{3,}/g, '\n\n').trim();
  return clean.length > 700 ? `${clean.slice(0, 697).trimEnd()}…` : clean;
}

// A multiple is only meaningful against a baseline of several posts. When the
// baseline is missing or the post is not in the recent window, the row says so
// by carrying no outlier tag, rather than claiming 1.0×.
function outlierTag(value, baseline) {
  if (!baseline || !value) return null;
  return `${(value / baseline).toFixed(1)}× outlier`;
}

function categorise(author) {
  const a = String(author).toLowerCase();
  if (/hormozi|founder|startup|saas|business|entrepreneur/.test(a)) return 'founders';
  if (/write|author|essay|book|word|letter/.test(a)) return 'writers';
  return 'creators';
}

// ─── YouTube ───

export function youtubeId(url) {
  const host = url.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null;
  if (host !== 'youtube.com' && host !== 'music.youtube.com') return null;
  if (url.pathname === '/watch') return url.searchParams.get('v');
  const m = url.pathname.match(/^\/(?:shorts|live|embed|v)\/([^/?#]+)/);
  return m ? m[1] : null;
}

async function resolveYouTube(videoId) {
  const oembed = await getJson(
    'https://www.youtube.com/oembed?format=json&url=' +
    encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)
  );

  const channelHandle = String(oembed.author_url || '').split('/@')[1] || '';
  let views = 0;
  let likes = 0;
  let baseline = 0;
  let published = null;

  // The RSS feed is the only free source of view counts, and it carries the
  // channel's last 15 videos — enough for a median, and enough to find this
  // video when it is recent. An older video still resolves; it just has no
  // numbers to score, which the row states instead of inventing.
  if (channelHandle) {
    try {
      const page = await get(`https://www.youtube.com/@${encodeURIComponent(channelHandle)}`);
      const channelId = (page.match(/channel_id=(UC[A-Za-z0-9_-]{22})/) || [])[1];
      if (channelId) {
        const xml = await get(RSS + channelId);
        const entries = (xml.match(/<entry>[\s\S]*?<\/entry>/g) || []).map((block) => ({
          id: (block.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1],
          views: Number((block.match(/views="(\d+)"/) || [])[1] || 0),
          likes: Number((block.match(/count="(\d+)"/) || [])[1] || 0),
          published: (block.match(/<published>(.*?)<\/published>/) || [])[1] || null,
        }));
        baseline = median(entries.map((e) => e.views));
        const mine = entries.find((e) => e.id === videoId);
        if (mine) {
          views = mine.views;
          likes = mine.likes;
          published = mine.published;
        }
      }
    } catch {
      // Numbers are a bonus here; the link still resolves without them.
    }
  }

  const author = decodeEntities(oembed.author_name || channelHandle || 'YouTube');
  return {
    source: 'youtube',
    row: {
      id: `yt_${slug(channelHandle || author)}_${videoId}`,
      cat: categorise(author),
      creator_name: author,
      handle: `@${channelHandle || slug(author)} · YouTube`,
      avatar_handle: channelHandle || slug(author),
      text: decodeEntities(oembed.title || ''),
      outlier_tag: outlierTag(views, baseline),
      views: views ? `${compact(views)} views` : '',
      source_url: `https://www.youtube.com/watch?v=${videoId}`,
      media_type: 'video',
      thumb_url: oembed.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: null,
      likes: likes ? compact(likes) : null,
      reposts: null,
      comments: null,
      read_time: null,
      avatar_url: null,
      publication: null,
      posted_at: published,
      position: 0,
    },
  };
}

// ─── Substack ───

export function substackPostSlug(url) {
  const m = url.pathname.match(/^\/p\/([^/?#]+)/);
  return m ? m[1] : null;
}

export function substackNoteId(url) {
  const m = url.pathname.match(/\/note\/c-(\d+)/);
  return m ? m[1] : null;
}

async function resolveSubstackPost(url, postSlug) {
  const post = await getJson(`https://${url.host}/api/v1/posts/${encodeURIComponent(postSlug)}`);
  if (!post || !post.title) throw new Error('That Substack link did not resolve to a post');

  const byline = (post.publishedBylines || [])[0] || {};
  const pubUser = (byline.publicationUsers || []).find((u) => u.publication) || {};
  const publication = pubUser.publication || {};
  const subdomain = publication.subdomain || url.host.replace(/\.substack\.com$/, '');
  const author = byline.name || publication.name || subdomain;

  // Score against the publication's own median, the same question the ingest
  // asks: did this post beat what this writer usually does?
  let baseline = 0;
  try {
    const archive = await getJson(
      `https://${url.host}/api/v1/archive?sort=new&limit=24`
    );
    if (Array.isArray(archive)) baseline = median(archive.map((p) => p.reaction_count || 0));
  } catch {
    // No archive (rare, and some publications block it) → no multiple.
  }

  return {
    source: 'substack',
    row: {
      id: `sub_${slug(subdomain)}_${slug(post.slug || postSlug)}`,
      cat: 'writers',
      creator_name: author,
      handle: `@${byline.handle || subdomain} · Substack`,
      avatar_handle: byline.handle || subdomain,
      text: post.subtitle ? `${post.title} — ${post.subtitle}` : post.title,
      outlier_tag: outlierTag(post.reaction_count || 0, baseline),
      views: `${compact(post.reaction_count || 0)} reactions`,
      source_url: post.canonical_url || `https://${url.host}/p/${postSlug}`,
      media_type: post.cover_image ? 'image' : null,
      thumb_url: post.cover_image || null,
      duration: null,
      likes: compact(post.reaction_count || 0),
      reposts: post.restacks ? compact(post.restacks) : null,
      comments: post.comment_count ? compact(post.comment_count) : null,
      read_time: readTime(post.wordcount),
      avatar_url: byline.photo_url || null,
      publication: publication.name || null,
      posted_at: post.post_date || null,
      position: 0,
    },
  };
}

async function resolveSubstackNote(noteId) {
  const payload = await getJson(`${SUBSTACK_API}/reader/comment/${encodeURIComponent(noteId)}`);
  const note = payload && payload.item && payload.item.comment;
  if (!note || !note.body) throw new Error('That note is not public');

  // Notes are scored against the writer's other notes, never against their
  // essays: a 200-like note and a 200-like essay are not the same event.
  let baseline = 0;
  if (note.user_id) {
    try {
      const feed = await getJson(
        `${SUBSTACK_API}/reader/feed/profile/${note.user_id}?types%5B%5D=note&limit=24`
      );
      const mine = (feed.items || [])
        .map((i) => i.comment)
        .filter((c) => c && c.body && c.user_id === note.user_id);
      if (mine.length >= 6) baseline = median(mine.map((c) => c.reaction_count || 0));
    } catch {
      // Same as above: no baseline is better than a fake one.
    }
  }

  const handle = note.handle || slug(note.name);
  return {
    source: 'substack-note',
    row: {
      id: `note_${slug(handle)}_${note.id}`,
      cat: 'writers',
      creator_name: note.name || handle,
      handle: `@${handle} · Substack`,
      avatar_handle: handle,
      text: noteText(note.body),
      outlier_tag: outlierTag(note.reaction_count || 0, baseline),
      views: `${compact(note.reaction_count || 0)} likes`,
      source_url: `https://substack.com/@${handle}/note/c-${note.id}`,
      media_type: 'note',
      thumb_url: null,
      duration: null,
      likes: compact(note.reaction_count || 0),
      reposts: note.restacks ? compact(note.restacks) : null,
      comments: note.children_count ? compact(note.children_count) : null,
      read_time: null,
      avatar_url: note.photo_url || null,
      publication: (note.user_primary_publication && note.user_primary_publication.name) || null,
      posted_at: note.date || null,
      position: 0,
    },
  };
}

// A bare "404 from substack.com" tells the person holding the link nothing they
// can act on. Upstream refusals are translated per source; anything else (a
// timeout, a blocked host) already reads as a sentence and is passed through.
function friendly(message) {
  return (err) => {
    const raw = String((err && err.message) || err);
    throw new Error(/^(401|403|404|410)\b/.test(raw) ? message : raw);
  };
}

export default async function handler(req, res) {
  // This endpoint makes outbound requests on a caller's behalf, so it is the
  // kind of thing worth keeping on a short leash even though it costs no money.
  const WINDOW_MS = 60_000;
  if (tooMany(
    res,
    rateLimit(req, 'resolve', { windowMs: WINDOW_MS, perIp: 20, global: 200 }),
    WINDOW_MS,
    'Too many links at once. Give it a minute.'
  )) return;

  const raw = String(req.query.url || (req.body && req.body.url) || '').trim();
  if (!raw) {
    return res.status(400).json({
      error: 'Pass ?url= a YouTube video, a Substack post, or a Substack note',
    });
  }

  let url;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return res.status(400).json({ error: `"${raw.slice(0, 80)}" is not a link` });
  }

  try {
    const videoId = youtubeId(url);
    if (videoId) {
      const out = await resolveYouTube(videoId).catch(
        friendly('YouTube will not show that video — it may be private or deleted')
      );
      return res.status(200).json({ ok: true, ...out });
    }

    const noteId = substackNoteId(url);
    if (noteId) {
      const out = await resolveSubstackNote(noteId).catch(
        friendly('Substack has no public note at that link')
      );
      return res.status(200).json({ ok: true, ...out });
    }

    const postSlug = substackPostSlug(url);
    if (postSlug) {
      const out = await resolveSubstackPost(url, postSlug).catch(
        friendly('That Substack post is not public, or the link has a typo')
      );
      return res.status(200).json({ ok: true, ...out });
    }

    return res.status(422).json({
      error: 'Sona can read YouTube videos, Substack posts and Substack notes so far',
      hint: 'A Substack link looks like /p/<post> or /@handle/note/c-<id>',
    });
  } catch (err) {
    const message = String((err && err.message) || err);
    console.warn(`[Resolve] ${url.host} failed: ${message}`);
    return res.status(502).json({ error: message });
  }
}
