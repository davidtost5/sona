import { generateKeyPairSync, sign as rsaSign } from 'node:crypto';

// Exercises /api/agent's guards (method, setup, Clerk session check, input
// validation) against the real handler. Clerk's JWKS endpoint is faked with a
// local key pair; no request ever reaches the model.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url) === 'https://api.clerk.com/v1/jwks') {
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(url, opts);
};

delete process.env.SUPABASE_URL;
const { default: handler } = await import('../api/agent.js');

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(payload, { kid = KID, key = privateKey } = {}) {
  const head = b64({ alg: 'RS256', kid, typ: 'JWT' });
  const body = b64(payload);
  const sig = rsaSign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url');
  return `${head}.${body}.${sig}`;
}
const now = Math.floor(Date.now() / 1000);
const good = { sub: 'user_1', exp: now + 300, nbf: now - 10, azp: 'https://buildwithsona.com' };

function response() {
  const res = { code: 200, headers: {} };
  res.status = c => { res.code = c; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.json = () => res;
  res.write = () => true;
  res.end = () => res;
  return res;
}
const cases = [];
async function status(label, req, want) {
  const res = response();
  await handler({ headers: {}, ...req }, res);
  cases.push([label, res.code, want]);
}
const auth = t => ({ authorization: `Bearer ${t}` });
const turn = { messages: [{ role: 'user', content: 'What is working for founders?' }] };

await status('GET refused', { method: 'GET' }, 405);

delete process.env.ANTHROPIC_API_KEY; delete process.env.CLERK_SECRET_KEY;
await status('not configured -> 503', { method: 'POST', headers: auth(token(good)), body: turn }, 503);

process.env.ANTHROPIC_API_KEY = 'test'; process.env.CLERK_SECRET_KEY = 'test';
await status('no token -> 401', { method: 'POST', body: turn }, 401);
await status('garbage token -> 401', { method: 'POST', headers: auth('abc.def.ghi'), body: turn }, 401);
await status('expired token -> 401', { method: 'POST', headers: auth(token({ ...good, exp: now - 60 })), body: turn }, 401);
await status('foreign origin -> 401', { method: 'POST', headers: auth(token({ ...good, azp: 'https://evil.example' })), body: turn }, 401);
const { privateKey: otherKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
await status('wrong signing key -> 401', { method: 'POST', headers: auth(token(good, { key: otherKey })), body: turn }, 401);
await status('empty conversation -> 400', { method: 'POST', headers: auth(token(good)), body: { messages: [] } }, 400);
await status('must end on a user turn -> 400', { method: 'POST', headers: auth(token(good)),
  body: { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] } }, 400);
await status('bad role -> 400', { method: 'POST', headers: auth(token(good)), body: { messages: [{ role: 'system', content: 'x' }] } }, 400);
await status('too long -> 400', { method: 'POST', headers: auth(token(good)),
  body: { messages: Array.from({ length: 31 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x' })) } }, 400);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` (got ${got}, want ${want})`}`);
}
console.log(`\n  ${cases.length - failed}/${cases.length} passed`);
if (failed) process.exit(1);
