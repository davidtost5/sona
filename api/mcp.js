// Sona's MCP server — lets Claude (Desktop, Code, or any MCP client) query the
// outlier research directly, the way Eden exposes its research to agents.
//
// Transport: Streamable HTTP. One POST endpoint speaking JSON-RPC 2.0.
//   POST /api/mcp  { "jsonrpc":"2.0", "id":1, "method":"tools/list" }
//
// Connect it in Claude → Settings → Connectors → Add custom connector:
//   https://buildwithsona.com/api/mcp
//
// Auth: set MCP_TOKEN in the environment to require `Authorization: Bearer <token>`.
// Without it every tool is open: the outlier catalog is already public via
// /api/outliers, and decode_post runs Sona's local decoder, which costs nothing.

import { supabase } from './_supabase.js';
import crypto from 'crypto';
// The decoder the site runs in the browser, loaded as-is. It publishes itself
// on globalThis.SonaDecode when there is no window.
import '../public/local-decode.js';

const SonaDecode = globalThis.SonaDecode;

const SERVER = { name: 'sona-mcp', title: 'Sona MCP', version: '1.0.0' };

// Versions this server can speak, newest first.
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const TOOLS = [
  {
    name: 'search_outliers',
    title: 'Search outlier posts',
    description:
      'Search Sona\'s curated feed of high-performing posts and videos from entrepreneurs and creators. ' +
      'Each result carries the real engagement figure and, where one was computed, an outlier multiplier ' +
      '(the post\'s views against that creator\'s own median). Call this when the user asks what is working ' +
      'on social right now, wants proven hooks or angles for a topic, or is researching a specific creator.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Free-text match against post text, creator name, and handle. Omit to browse everything.',
        },
        cat: {
          type: 'string',
          enum: ['founders', 'writers', 'creators'],
          description: 'Restrict to one audience category.',
        },
        media_type: {
          type: 'string',
          enum: ['post', 'video'],
          description: 'Restrict to written posts or to YouTube videos.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Maximum results to return. Defaults to 10.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_outlier',
    title: 'Get one outlier post',
    description:
      'Fetch a single outlier by its id, including the source URL and every stored field. ' +
      'Use after search_outliers when the user wants the full record or a link to the original.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The outlier id returned by search_outliers.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'decode_post',
    title: 'Decode why a post worked',
    description:
      'Break a post down into the structure that carries it: how the opener works, where it turns, ' +
      'where it lands, the reusable shape underneath, and steps to rebuild that shape with your own ' +
      'point — plus the closest templates from Sona\'s hook library. Runs Sona\'s rule-based decoder, ' +
      'the same one on buildwithsona.com: free, instant and deterministic, with no model behind it. ' +
      'It reads structure, not meaning, so bring your own judgement to the why. `pattern` is a ' +
      'fill-in template only when `pattern_kind` is "template"; otherwise it is the post\'s opening.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The full text of the post to decode, 10–2000 characters.' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
];

// ── helpers ──

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: '2.0', id, error: err };
}

// A tool failure is reported inside a successful result with isError — that is how
// the model sees it and can recover. Protocol-level errors use rpcError instead.
function toolText(text, isError) {
  const out = { content: [{ type: 'text', text }] };
  if (isError) out.isError = true;
  return out;
}

function bearer(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : '';
}

function authorized(req) {
  const token = process.env.MCP_TOKEN;
  if (!token) return true; // open mode — every tool is free to call
  return safeEqual(bearer(req), token);
}

// ── tools ──

async function searchOutliers(args) {
  if (!supabase) return toolText('The research index is not configured on this deployment.', true);

  const limit = Math.max(1, Math.min(Number(args.limit) || 10, 50));
  let q = supabase.from('outliers').select('*');

  if (args.cat) q = q.eq('cat', args.cat);
  if (args.media_type) {
    q = args.media_type === 'post'
      // Rows predating the video migration have no media_type; they are posts.
      ? q.or('media_type.is.null,media_type.eq.post')
      : q.eq('media_type', args.media_type);
  }
  if (args.query) {
    const safe = String(args.query).replace(/[%,()]/g, ' ').trim();
    if (safe) q = q.or(`text.ilike.%${safe}%,creator_name.ilike.%${safe}%,handle.ilike.%${safe}%`);
  }

  const { data, error } = await q.order('position', { ascending: true }).limit(limit);
  if (error) return toolText(`Search failed: ${error.message}`, true);
  if (!data || !data.length) return toolText('No outliers matched that search.');

  const lines = data.map(r => {
    const bits = [
      `id: ${r.id}`,
      `${r.creator_name} (${r.handle})`,
      r.outlier_tag ? `outlier: ${r.outlier_tag}` : null,
      r.views ? `views: ${r.views}` : null,
      r.media_type === 'video' ? 'type: video' : 'type: post',
      r.source_url ? `url: ${r.source_url}` : null,
      `text: ${r.text}`,
    ].filter(Boolean);
    return bits.join('\n');
  });
  return toolText(`${data.length} result(s):\n\n${lines.join('\n\n---\n\n')}`);
}

async function getOutlier(args) {
  if (!supabase) return toolText('The research index is not configured on this deployment.', true);
  const id = String(args.id || '').trim();
  if (!id) return toolText('An outlier id is required.', true);

  const { data, error } = await supabase.from('outliers').select('*').eq('id', id).maybeSingle();
  if (error) return toolText(`Lookup failed: ${error.message}`, true);
  if (!data) return toolText(`No outlier found with id ${id}.`, true);
  return toolText(JSON.stringify(data, null, 2));
}

// Matches the site's Decode form: long enough to have a shape, short enough to
// be a post rather than an essay.
const DECODE_MIN = 10, DECODE_MAX = 2000;
// irMatchHooks' own floor for naming a shape; weaker matches are noise.
const MATCH_FLOOR = 0.35;

function decodePost(args) {
  if (!SonaDecode) return toolText('The decoder failed to load on this server.', true);
  const text = String(args.text || '').trim();
  if (text.length < DECODE_MIN) {
    return toolText(`Post text must be at least ${DECODE_MIN} characters.`, true);
  }
  if (text.length > DECODE_MAX) {
    return toolText(`Post text is ${text.length} characters; decode_post takes up to ${DECODE_MAX}.`, true);
  }

  const d = SonaDecode.decode(text);
  const matches = SonaDecode.matchHooks(text, 3)
    .filter(m => m.score >= MATCH_FLOOR)
    .map(m => ({ category: m.h.cat, template: m.h.pattern, example: m.h.eg, score: Math.round(m.score * 100) / 100 }));

  return toolText(JSON.stringify({
    hook: d.hook,
    tension: d.tension,
    payoff: d.payoff,
    pattern: d.pattern,
    // The decoder falls back to the post's first sentences when it can't
    // abstract a template. Say which, so a caller doesn't treat the user's own
    // words as a reusable skeleton.
    pattern_kind: /\[[^\]]+\]/.test(d.pattern) ? 'template' : 'opening',
    why: d.why,
    apply: d.apply,
    library_matches: matches,
  }, null, 2));
}

async function callTool(name, args, req) {
  switch (name) {
    case 'search_outliers': return searchOutliers(args || {});
    case 'get_outlier':     return getOutlier(args || {});
    case 'decode_post':     return decodePost(args || {});
    default:                return null; // signals unknown tool → rpcError
  }
}

// ── JSON-RPC dispatch ──

async function dispatch(msg, req) {
  const { id, method, params } = msg || {};

  switch (method) {
    case 'initialize': {
      const asked = params && params.protocolVersion;
      const version = SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];
      return rpcResult(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions:
          'Sona indexes high-performing posts and videos from entrepreneurs and creators, with real ' +
          'engagement figures. Search it for proven hooks and angles, then decode a post to get the ' +
          'reusable pattern behind it.',
      });
    }

    case 'ping':
      return rpcResult(id, {});

    case 'tools/list':
      return rpcResult(id, { tools: TOOLS });

    case 'tools/call': {
      const name = params && params.name;
      const result = await callTool(name, (params && params.arguments) || {}, req);
      if (result === null) return rpcError(id, -32602, `Unknown tool: ${name}`);
      return rpcResult(id, result);
    }

    // Capabilities we don't advertise — answer empty rather than erroring, so
    // clients that probe unconditionally don't log a failure.
    case 'resources/list':  return rpcResult(id, { resources: [] });
    case 'prompts/list':    return rpcResult(id, { prompts: [] });

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, mcp-protocol-version');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json(rpcError(null, -32600, 'This MCP endpoint accepts POST.'));
  }

  if (!authorized(req)) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return res.status(401).json(rpcError(null, -32600, 'Invalid or missing bearer token.'));
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json(rpcError(null, -32700, 'Parse error')); }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json(rpcError(null, -32600, 'Invalid Request'));
  }

  // A batch is an array; a notification is a message with no `id` and gets no reply.
  const batch = Array.isArray(body) ? body : [body];
  const replies = [];
  for (const msg of batch) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      replies.push(rpcError((msg && msg.id) ?? null, -32600, 'Invalid Request'));
      continue;
    }
    const isNotification = msg.id === undefined || msg.id === null;
    try {
      const reply = await dispatch(msg, req);
      if (!isNotification) replies.push(reply);
    } catch (e) {
      if (!isNotification) {
        replies.push(rpcError(msg.id, -32603, 'Internal error', (e && e.message) || undefined));
      }
    }
  }

  // Every message was a notification — acknowledge with no content.
  if (!replies.length) return res.status(202).end();

  return res.status(200).json(Array.isArray(body) ? replies : replies[0]);
}
