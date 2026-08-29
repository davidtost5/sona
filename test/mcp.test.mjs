// Exercises Sona's MCP server end to end.
//   node test/mcp.test.mjs
//
// The protocol layer runs with no configuration. The two live-database checks
// are skipped unless SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are present in the
// environment (or in a .env.prod holding real values).
import fs from 'fs';

// Mock Supabase to prevent hanging during imports
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';

const envFile = new URL('../.env.prod', import.meta.url);
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v) process.env[m[1]] = v;   // ignore blank values from `vercel env pull`
  }
}

const { default: handler } = await import(new URL('../api/mcp.js', import.meta.url).href);

function mockRes() {
  const r = {
    statusCode: 200, headers: {}, body: undefined, ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; this.ended = true; return this; },
    end() { this.ended = true; return this; },
  };
  return r;
}

async function call(body, { method = 'POST', headers = {} } = {}) {
  const req = { method, headers: { host: 'buildwithsona.com', ...headers }, body };
  const res = mockRes();
  await handler(req, res);
  return res;
}

const checks = [];
const ok = (name, cond, detail) => checks.push({ name, pass: !!cond, detail });
// .env.prod ships with empty values, so the live DB round-trip can only be
// checked where credentials exist. Skip rather than fail on a missing secret.
const HAS_DB = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const okDb = (name, cond, detail) =>
  HAS_DB ? ok(name, cond, detail) : checks.push({ name, skip: true, detail: 'no DB credentials (mocked for test)' });

// 1. initialize
let r = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
ok('initialize returns serverInfo', r.body?.result?.serverInfo?.name === 'sona', JSON.stringify(r.body?.result?.serverInfo));
ok('initialize echoes supported protocol', r.body?.result?.protocolVersion === '2025-06-18', r.body?.result?.protocolVersion);

// 1b. unknown protocol falls back to newest
r = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
ok('unknown protocol falls back', r.body?.result?.protocolVersion === '2025-06-18', r.body?.result?.protocolVersion);

// 2. tools/list
r = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
const tools = r.body?.result?.tools || [];
ok('tools/list returns 3 tools', tools.length === 3, tools.map(t => t.name).join(','));
ok('every tool has inputSchema', tools.every(t => t.inputSchema?.type === 'object'));
ok('every tool has a description', tools.every(t => (t.description || '').length > 40));

// 3. notification gets 202 and no body
r = await call({ jsonrpc: '2.0', method: 'notifications/initialized' });
ok('notification -> 202 no body', r.statusCode === 202 && r.body === undefined, `status ${r.statusCode}`);

// 4. unknown method
r = await call({ jsonrpc: '2.0', id: 4, method: 'nope/nope' });
ok('unknown method -> -32601', r.body?.error?.code === -32601, JSON.stringify(r.body?.error));

// 5. unknown tool
r = await call({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'ghost', arguments: {} } });
ok('unknown tool -> -32602', r.body?.error?.code === -32602, JSON.stringify(r.body?.error));

// 6. real search against Supabase
r = await call({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'search_outliers', arguments: { limit: 5 } } });
const text = r.body?.result?.content?.[0]?.text || '';
ok('search_outliers returns content', text.length > 0, text.slice(0, 160).replace(/\n/g, ' | '));
okDb('search_outliers not an error', !r.body?.result?.isError, JSON.stringify(r.body?.result?.isError));

// 6b. filtered search
r = await call({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'search_outliers', arguments: { query: 'the', limit: 3 } } });
ok('filtered search works', !!r.body?.result?.content?.[0]?.text, (r.body?.result?.content?.[0]?.text || '').slice(0, 120).replace(/\n/g, ' | '));

// 6c. media_type=post must not crash on rows lacking media_type
r = await call({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'search_outliers', arguments: { media_type: 'post', limit: 3 } } });
okDb('media_type=post ok', !r.body?.result?.isError, (r.body?.result?.content?.[0]?.text || '').slice(0, 120).replace(/\n/g, ' | '));

// 7. decode refused without MCP_TOKEN (must not spend credit)
r = await call({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'decode_post', arguments: { text: 'hello' } } });
ok('decode refused when open', r.body?.result?.isError === true && /MCP_TOKEN/.test(r.body?.result?.content?.[0]?.text || ''), (r.body?.result?.content?.[0]?.text || '').slice(0, 90));

// 8. batch
r = await call([
  { jsonrpc: '2.0', id: 'a', method: 'ping' },
  { jsonrpc: '2.0', id: 'b', method: 'tools/list' },
]);
ok('batch returns array of 2', Array.isArray(r.body) && r.body.length === 2, JSON.stringify(r.body?.map?.(x => x.id)));

// 9. bad JSON string body
r = await call('{not json');
ok('bad json -> -32700', r.body?.error?.code === -32700, JSON.stringify(r.body?.error));

// 10. GET rejected
r = await call(null, { method: 'GET' });
ok('GET -> 405', r.statusCode === 405, `status ${r.statusCode}`);

// 11. CORS preflight
r = await call(null, { method: 'OPTIONS' });
ok('OPTIONS -> 204 + CORS', r.statusCode === 204 && r.headers['access-control-allow-origin'] === '*', `status ${r.statusCode}`);

// 12. auth enforced when MCP_TOKEN set
process.env.MCP_TOKEN = 'secret-token-123';
r = await call({ jsonrpc: '2.0', id: 12, method: 'tools/list' });
ok('no token -> 401 when MCP_TOKEN set', r.statusCode === 401, `status ${r.statusCode}`);
r = await call({ jsonrpc: '2.0', id: 13, method: 'tools/list' }, { headers: { authorization: 'Bearer wrong' } });
ok('wrong token -> 401', r.statusCode === 401, `status ${r.statusCode}`);
r = await call({ jsonrpc: '2.0', id: 14, method: 'tools/list' }, { headers: { authorization: 'Bearer secret-token-123' } });
ok('right token -> 200', r.statusCode === 200 && !!r.body?.result?.tools, `status ${r.statusCode}`);
delete process.env.MCP_TOKEN;

let failed = 0, skipped = 0;
for (const c of checks) {
  if (c.skip) { skipped++; console.log(`SKIP  ${c.name} (${c.detail})`); continue; }
  if (!c.pass) failed++;
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `\n        ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed - skipped}/${checks.length - skipped} passed, ${skipped} skipped`);
const exitCode = failed ? 1 : 0;
process.exit(exitCode);
