// decode_post on the MCP server runs the site's own decoder (public/local-decode.js)
// in-process. It used to forward to /api/decode, which was deleted, so every call
// failed. These call the handler directly: no server, and no network allowed.
delete process.env.MCP_TOKEN;
globalThis.fetch = () => { throw new Error('decode_post must not touch the network'); };

const { default: handler } = await import('../api/mcp.js');

function call(body, headers = {}) {
  return new Promise((resolve) => {
    const res = {
      code: 200, body: undefined,
      setHeader() {},
      status(c) { this.code = c; return this; },
      json(o) { this.body = o; resolve(this); return this; },
      end() { resolve(this); return this; },
    };
    handler({ method: 'POST', headers, body }, res);
  });
}
const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, params });
const decode = (text) => call(rpc('tools/call', { name: 'decode_post', arguments: { text } }));

const t = [];
const chk = (n, c) => { t.push(!!c); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); };

const list = await call(rpc('tools/list'));
const tool = list.body.result.tools.find((x) => x.name === 'decode_post');
chk('decode_post is listed', tool);
chk('its description no longer claims a model call', tool && !/model call|credit/i.test(tool.description));

const post = 'Most founders post too much. The ones who break out pick one contrarian take and repeat it.';
const ok = await decode(post);
const r = ok.body.result;
chk('works with no MCP_TOKEN set (it costs nothing)', ok.code === 200 && r && !r.isError);
const out = r && !r.isError ? JSON.parse(r.content[0].text) : {};
chk('returns the decoder fields', ['hook', 'tension', 'payoff', 'pattern', 'why', 'apply'].every((k) => typeof out[k] === 'string' && out[k]));
chk('says whether pattern is a template', out.pattern_kind === 'template' || out.pattern_kind === 'opening');
chk('pattern_kind agrees with the pattern', (out.pattern_kind === 'template') === /\[[^\]]+\]/.test(out.pattern || ''));
chk('finds the contrarian template in the hook library', (out.library_matches || [])[0]?.category === 'contrarian');
chk('library matches clear the confidence floor', (out.library_matches || []).every((m) => m.score >= 0.35));

const again = await decode(post);
chk('is deterministic', again.body.result.content[0].text === r.content[0].text);

const short = await decode('too short');
chk('rejects under 10 characters as a tool error', short.body.result.isError && /at least 10/.test(short.body.result.content[0].text));
const long = await decode('x'.repeat(2001));
chk('rejects over 2000 characters as a tool error', long.body.result.isError && /2000/.test(long.body.result.content[0].text));

process.env.MCP_TOKEN = 'secret';
const denied = await call(rpc('tools/list'));
chk('a set MCP_TOKEN still gates the server', denied.code === 401);
const allowed = await call(rpc('tools/call', { name: 'decode_post', arguments: { text: post } }), { authorization: 'Bearer secret' });
chk('and decode_post works with the token', allowed.code === 200 && !allowed.body.result.isError);

process.exit(t.every(Boolean) ? 0 : 1);
