// Shared abuse guard for public, unauthenticated endpoints.
//
// These endpoints are open by design — anyone can sign up or contact us — but
// each one costs something real when abused: model credit (/api/decode), rows in
// Postgres, and outbound email. Burning the send quota is the expensive one: a
// new sending domain that emits a burst of junk gets reputation damage that is
// slow and painful to undo.
//
// Counters are per warm serverless instance, not global. Vercel may run several,
// so a determined attacker spread across instances gets a multiple of these
// numbers. That's a deliberate trade: no dependencies, no infrastructure, and it
// converts "unbounded" into "bounded per instance". A global limit needs shared
// state (Supabase or KV) and is worth adding if abuse actually shows up.

const buckets = new Map(); // name -> { hits: Map<ip, number[]>, global: number[] }

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || 'unknown';
}

/**
 * @returns {'ip'|'global'|null} which limit tripped, or null when allowed.
 */
export function rateLimit(req, name, { windowMs, perIp, global }) {
  if (!buckets.has(name)) buckets.set(name, { hits: new Map(), global: [] });
  const b = buckets.get(name);

  const now = Date.now();
  const cutoff = now - windowMs;

  b.global = b.global.filter(t => t > cutoff);
  if (b.global.length >= global) return 'global';

  const ip = clientIp(req);
  const recent = (b.hits.get(ip) || []).filter(t => t > cutoff);
  if (recent.length >= perIp) {
    b.hits.set(ip, recent);
    return 'ip';
  }

  recent.push(now);
  b.hits.set(ip, recent);
  b.global.push(now);

  // Keep the map from growing without bound on a long-lived instance.
  if (b.hits.size > 5000) {
    for (const [k, v] of b.hits) if (!v.some(t => t > cutoff)) b.hits.delete(k);
  }
  return null;
}

/** Uniform 429. Returns true when the caller should stop. */
export function tooMany(res, which, windowMs, message) {
  if (!which) return false;
  res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
  res.status(429).json({ error: message });
  return true;
}
