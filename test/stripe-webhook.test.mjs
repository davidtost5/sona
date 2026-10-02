import { createHmac } from 'node:crypto';

// Signature checks run against the real handler with Supabase unconfigured, so
// nothing is written; subscriptionRow is imported directly.
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
delete process.env.SUPABASE_URL;
const { default: handler, subscriptionRow } = await import('../api/stripe-webhook.js');
const { Readable } = await import('node:stream');

function request(body, sigHeader) {
  const req = Readable.from([body]);
  req.method = 'POST';
  req.headers = sigHeader === undefined ? {} : { 'stripe-signature': sigHeader };
  return req;
}
function response() {
  const res = { code: 200 };
  res.status = (c) => { res.code = c; return res; };
  res.end = () => res;
  res.json = () => res;
  return res;
}
const sign = (body, ts, secret = 'whsec_test_secret') =>
  `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;

const body = JSON.stringify({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
const now = Math.floor(Date.now() / 1000);

const cases = [];
async function status(label, b, sig, want) {
  const res = response();
  await handler(request(b, sig), res);
  cases.push([label, res.code, want]);
}
await status('valid signature accepted', body, sign(body, now), 200);
await status('tampered body rejected', body.replace('sub_1', 'sub_X'), sign(body, now), 400);
await status('wrong secret rejected', body, sign(body, now, 'whsec_other'), 400);
await status('replay >5min rejected', body, sign(body, now - 400), 400);
await status('missing header rejected', body, undefined, 400);

// A Creator annual subscription the customer has cancelled from the portal.
const row = subscriptionRow({
  id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: true,
  items: { data: [{ current_period_end: 1790000000,
    price: { id: 'price_1', unit_amount: 19000, recurring: { interval: 'year' } } }] },
});
cases.push(['plan from amount', row.plan, 'creator']);
cases.push(['interval kept', row.billing_interval, 'year']);
cases.push(['cancel flag kept', row.cancel_at_period_end, true]);
cases.push(['period end as ISO', row.current_period_end, new Date(1790000000 * 1000).toISOString()]);
cases.push(['no email column (never wipes checkout email)', 'email' in row, false]);
cases.push(['unknown price → null plan',
  subscriptionRow({ id: 's', items: { data: [{ price: { unit_amount: 999 } }] } }).plan, null]);
cases.push(['older API: period end on subscription',
  subscriptionRow({ id: 's', current_period_end: 1790000000 }).current_period_end,
  new Date(1790000000 * 1000).toISOString()]);

let pass = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (ok) pass++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (want ${want}, got ${got})`}`);
}
console.log(`\n  ${pass}/${cases.length} passed`);
if (pass !== cases.length) process.exit(1);
