import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';

// Signature checks run against the real handler with Supabase unconfigured, so
// nothing is written; subscriptionRow is imported directly.
const SECRET = 'whsec_' + Buffer.from('polar-signing-key-000000000000').toString('base64');
process.env.POLAR_WEBHOOK_SECRET = SECRET;
delete process.env.SUPABASE_URL;
const { default: handler, subscriptionRow } = await import('../api/polar-webhook.js');

function request(body, headers) {
  const req = Readable.from([body]);
  req.method = 'POST';
  req.headers = headers;
  return req;
}
function response() {
  const res = { code: 200 };
  res.status = (c) => { res.code = c; return res; };
  res.end = () => res;
  res.json = () => res;
  return res;
}
const sign = (body, id, ts, secret = SECRET) => {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return 'v1,' + createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
};
const head = (id, ts, sig) => ({ 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': sig });

const body = JSON.stringify({ type: 'subscription.canceled', data: { id: 'sub_1' } });
const now = Math.floor(Date.now() / 1000);
const other = 'whsec_' + Buffer.from('another-key-000000000000000000').toString('base64');

const cases = [];
async function status(label, b, headers, want) {
  const res = response();
  await handler(request(b, headers), res);
  cases.push([label, res.code, want]);
}
await status('valid signature accepted', body, head('m1', now, sign(body, 'm1', now)), 200);
await status('tampered body rejected', body.replace('sub_1', 'sub_X'), head('m1', now, sign(body, 'm1', now)), 400);
await status('wrong secret rejected', body, head('m1', now, sign(body, 'm1', now, other)), 400);
await status('replay >5min rejected', body, head('m1', now - 400, sign(body, 'm1', now - 400)), 400);
await status('missing headers rejected', body, {}, 400);
await status('second signature in list accepted', body, head('m1', now, sign(body, 'm1', now, other) + ' ' + sign(body, 'm1', now)), 200);
await status('garbage signature rejected', body, head('m1', now, 'v1,notbase64!!'), 400);

// A Creator yearly subscription the customer has cancelled from the portal.
const row = subscriptionRow({
  id: 'sub_1', customer_id: 'cus_1', status: 'active', cancel_at_period_end: true,
  recurring_interval: 'year', current_period_end: '2027-11-01T00:00:00Z', product_id: 'prod_1',
  product: { id: 'prod_1', name: 'Creator' }, customer: { id: 'cus_1', email: 'a@b.co' },
});
cases.push(['plan from product name', row.plan, 'creator']);
cases.push(['Creator Pro is pro', subscriptionRow({ id: 's', product: { name: 'Creator Pro' } }).plan, 'pro']);
cases.push(['unknown product gives null plan', subscriptionRow({ id: 's', product: { name: 'Something' } }).plan, null]);
cases.push(['interval kept', row.billing_interval, 'year']);
cases.push(['interval falls back to product', subscriptionRow({ id: 's', product: { recurring_interval: 'month' } }).billing_interval, 'month']);
cases.push(['cancel flag kept', row.cancel_at_period_end, true]);
cases.push(['period end kept', row.current_period_end, '2027-11-01T00:00:00Z']);
cases.push(['email kept', row.email, 'a@b.co']);
cases.push(['no email key when absent (never wipes one)', 'email' in subscriptionRow({ id: 's' }), false]);

// Checkout and billing portal, through the real handler.
const { default: checkout } = await import('../api/checkout.js');
function run(query, env = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  try { checkout({ method: 'GET', query, body: null }, res); } finally { process.env = saved; }
  res.code = res.statusCode || res.code;
  return res;
}
const LIVE = 'https://buy.polar.sh/polar_cl_abc';
cases.push(['unset plan reports unconfigured', run({ plan: 'creator-monthly' }).code, 503]);
cases.push(['set plan returns its link', run({ plan: 'pro-annual' }, { POLAR_LINK_PRO_ANNUAL: LIVE }).body.url, LIVE]);
cases.push(['unknown plan rejected', run({ plan: 'nope' }).code, 400]);
cases.push(['sandbox link refused in production', run({ plan: 'pro-monthly' }, { POLAR_LINK_PRO_MONTHLY: 'https://sandbox-api.polar.sh/x', VERCEL_ENV: 'production' }).code, 503]);
cases.push(['portal falls back to contact form', run({ action: 'portal' }).headers.Location, '/contact.html?topic=billing']);
cases.push(['portal redirects when set', run({ action: 'portal' }, { POLAR_PORTAL_URL: 'https://polar.sh/sona/portal' }).headers.Location, 'https://polar.sh/sona/portal']);
cases.push(['non-Polar portal URL ignored', run({ action: 'portal' }, { POLAR_PORTAL_URL: 'https://evil.example/x' }).headers.Location, '/contact.html?topic=billing']);

let pass = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (ok) pass++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (want ${want}, got ${got})`}`);
}
console.log(`\n  ${pass}/${cases.length} passed`);
if (pass !== cases.length) process.exit(1);
