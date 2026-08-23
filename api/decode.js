// POST /api/decode — the Outlier decoder. Given an outlier post, returns a
// structured breakdown of WHY it worked. This is Sona's moat vs Eden: we don't
// write the post for you, we teach you why the outlier broke out so you can write
// it in your own voice.
//
// Cost design (solo founder, cost-sensitive):
//   1. Cache-first — keyed by sha256(text) in `post_decodes`. The SAME post is
//      paid for exactly once, ever, across every user. The 8 seed posts ship with
//      static decodes client-side and never reach this endpoint.
//   2. Cheapest capable model — claude-haiku-4-5 ($1/$5 per MTok). Each decode is
//      ~500 input + ~350 output tokens ≈ $0.002, and only on the FIRST view of a
//      brand-new post.
//   3. If ANTHROPIC_API_KEY isn't set, returns 503 so the client falls back to its
//      static decode — nothing breaks, nothing is charged.
//
// Vercel → Settings → Environment Variables:
//   ANTHROPIC_API_KEY = sk-ant-...

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { supabase } from './_supabase.js';

const MODEL = 'claude-haiku-4-5';
const MAX_TEXT = 2000; // guardrail: refuse absurd inputs so nobody can burn the key

// Structured-output schema — guarantees valid, parseable JSON in the exact shape
// the /app decoder modal expects. No prose to strip, no JSON.parse surprises.
const DECODE_SCHEMA = {
  type: 'object',
  properties: {
    hook:    { type: 'string', description: 'The hook type in 2-5 words (e.g. "Contrarian counter", "Stop / start reframe").' },
    tension: { type: 'string', description: 'The cognitive tension that makes a reader stop scrolling. One sentence.' },
    payoff:  { type: 'string', description: 'What the reader gets for engaging. One sentence.' },
    pattern: { type: 'string', description: 'The reusable template with [bracketed] slots, e.g. "Most [group] [belief]. The ones who break out [action]."' },
    why:     { type: 'string', description: 'Why this specific post broke out — the psychology, 1-2 sentences.' },
    apply:   { type: 'string', description: 'A bracketed version the reader fills in their own voice and niche.' },
  },
  required: ['hook', 'tension', 'payoff', 'pattern', 'why', 'apply'],
  additionalProperties: false,
};

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, author = '', platform = '' } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim().length < 10) {
    return res.status(400).json({ error: 'Provide the post text (min 10 chars).' });
  }
  if (text.length > MAX_TEXT) {
    return res.status(400).json({ error: 'Post text too long.' });
  }

  const key = sha256(text.trim());

  // 1. Cache hit — free, instant, no API call.
  if (supabase) {
    try {
      const { data } = await supabase
        .from('post_decodes')
        .select('decoded')
        .eq('id', key)
        .maybeSingle();
      if (data && data.decoded) {
        return res.status(200).json({ decoded: data.decoded, cached: true });
      }
    } catch (_) { /* fall through to API */ }
  }

  // 2. Not configured — let the client use its static fallback. Nothing charged.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Decoder not configured', fallback: true });
  }

  // 3. Generate with Claude Haiku, structured output.
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        'You are an expert at deconstructing why social posts go viral. You NEVER write posts for the user — you explain the mechanics so they can write it themselves, in their own voice. Be specific and concrete, never generic. Each field is one tight sentence except `hook` (2-5 words) and `pattern`/`apply` (templates with [bracketed] slots).',
      messages: [
        {
          role: 'user',
          content:
            `Decode why this ${platform || 'social'} post by ${author || 'a creator'} broke out:\n\n"${text.trim()}"`,
        },
      ],
      output_config: { format: { type: 'json_schema', schema: DECODE_SCHEMA } },
    });

    const block = response.content.find((b) => b.type === 'text');
    if (!block) throw new Error('No text block in response');
    const decoded = JSON.parse(block.text);

    // 4. Write through the cache so the next viewer (any user) pays nothing.
    if (supabase) {
      supabase
        .from('post_decodes')
        .upsert({ id: key, decoded, model: MODEL })
        .then(() => {}, () => {}); // fire-and-forget; don't block the response
    }

    return res.status(200).json({ decoded, cached: false });
  } catch (e) {
    console.error('decode failed', e?.message || e);
    return res.status(502).json({ error: 'Decode failed', fallback: true });
  }
}
