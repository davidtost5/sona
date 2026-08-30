import { createHmac, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';

// Lift verifySvix out of the handler so it can be exercised directly.
const src = fs.readFileSync(new URL('../api/clerk-webhook.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('function verifySvix'), src.indexOf('export default'));
const verifySvix = new Function('createHmac', 'timingSafeEqual', 'Buffer', 'Date',
  body + '; return verifySvix;')(createHmac, timingSafeEqual, Buffer, Date);

const secret = 'whsec_' + Buffer.from('super-secret-signing-key-000').toString('base64');
const payload = JSON.stringify({ type: 'user.deleted', data: { id: 'user_2abc' } });
const id = 'msg_123';
const now = Math.floor(Date.now() / 1000);

function sign(body, id, ts, sec) {
  const key = Buffer.from(sec.replace(/^whsec_/, ''), 'base64');
  return createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
}

const good = sign(payload, id, now, secret);
const cases = [
  ['valid signature accepted', {'svix-id':id,'svix-timestamp':String(now),'svix-signature':'v1,'+good}, payload, true],
  ['tampered body rejected',   {'svix-id':id,'svix-timestamp':String(now),'svix-signature':'v1,'+good}, payload.replace('user_2abc','user_EVIL'), false],
  ['wrong secret rejected',    {'svix-id':id,'svix-timestamp':String(now),'svix-signature':'v1,'+sign(payload,id,now,'whsec_'+Buffer.from('other').toString('base64'))}, payload, false],
  ['replay >5min rejected',    {'svix-id':id,'svix-timestamp':String(now-400),'svix-signature':'v1,'+sign(payload,id,now-400,secret)}, payload, false],
  ['missing headers rejected', {}, payload, false],
  ['rotated secret: 2nd sig',  {'svix-id':id,'svix-timestamp':String(now),'svix-signature':'v1,'+sign(payload,id,now,'whsec_'+Buffer.from('old').toString('base64'))+' v1,'+good}, payload, true],
  ['garbage sig rejected',     {'svix-id':id,'svix-timestamp':String(now),'svix-signature':'v1,notbase64!!'}, payload, false],
  ['empty sig rejected',       {'svix-id':id,'svix-timestamp':String(now),'svix-signature':''}, payload, false],
];

let pass = 0;
for (const [label, headers, b, want] of cases) {
  let got;
  try { got = verifySvix(b, headers, secret); } catch (e) { got = 'threw: ' + e.message; }
  const ok = got === want;
  if (ok) pass++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (want ${want}, got ${got})`}`);
}
console.log(`\n  ${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
