// The sign-in flow against a fake Clerk: who signs in, who signs up, and what
// people are told when something goes wrong.
import '../public/signin-flow.js';
const { createFlow, messageFor } = globalThis.SonaSignin;

const clerkError = (code) => Object.assign(new Error(code), { errors: [{ code }] });

function fakeClerk({ existing = false, signUpError = null, verifyStatus = 'complete', factors = null } = {}) {
  const calls = [];
  const si = {
    supportedFirstFactors: factors || [{ strategy: 'email_code', emailAddressId: 'ema_1' }],
    async prepareFirstFactor(a) { calls.push(['prepareFirstFactor', a]); return si; },
    async attemptFirstFactor(a) {
      calls.push(['attemptFirstFactor', a]);
      if (a.code !== '123456') throw clerkError('form_code_incorrect');
      return { status: verifyStatus, createdSessionId: 'sess_in' };
    },
  };
  const su = {
    async prepareEmailAddressVerification(a) { calls.push(['prepareEmailAddressVerification', a]); return su; },
    async attemptEmailAddressVerification(a) {
      calls.push(['attemptEmailAddressVerification', a]);
      if (a.code !== '123456') throw clerkError('form_code_incorrect');
      return { status: verifyStatus, createdSessionId: 'sess_up' };
    },
  };
  return {
    calls,
    client: {
      signIn: { async create(a) { calls.push(['signIn.create', a]); if (!existing) throw clerkError('form_identifier_not_found'); return si; } },
      signUp: { async create(a) { calls.push(['signUp.create', a]); if (signUpError) { const c = signUpError; signUpError = null; existing = true; throw clerkError(c); } return su; } },
    },
    async setActive(a) { calls.push(['setActive', a]); },
  };
}

const cases = [];
const check = (label, ok) => cases.push([label, Boolean(ok)]);
const has = (c, name) => c.calls.some(([n]) => n === name);
const rejects = async (p) => { try { await p; return null; } catch (e) { return e; } };

{
  const c = fakeClerk({ existing: true }); const f = createFlow(c);
  check('existing address signs in', (await f.start('a@b.co')) === 'in');
  check('sign-in sends the code to the right address', c.calls.some(([n, a]) => n === 'prepareFirstFactor' && a.emailAddressId === 'ema_1'));
  check('sign-in never creates an account', !has(c, 'signUp.create'));
  await f.verify('123456');
  check('sign-in starts the session', c.calls.some(([n, a]) => n === 'setActive' && a.session === 'sess_in'));
}
{
  const c = fakeClerk(); const f = createFlow(c);
  check('new address signs up', (await f.start('new@b.co')) === 'up');
  check('sign-up sends only the email', c.calls.some(([n, a]) => n === 'signUp.create' && Object.keys(a).join() === 'emailAddress'));
  await f.verify('123456');
  check('sign-up starts the session', c.calls.some(([n, a]) => n === 'setActive' && a.session === 'sess_up'));
}
{
  const c = fakeClerk({ signUpError: 'form_identifier_exists' }); const f = createFlow(c);
  check('account created in another tab falls back to sign-in', (await f.start('a@b.co')) === 'in');
}
{
  const c = fakeClerk({ existing: true }); const f = createFlow(c);
  await f.start('a@b.co');
  const e = await rejects(f.verify('000000'));
  check('wrong code explains itself', messageFor(e).includes('isn’t right'));
  check('wrong code starts no session', !has(c, 'setActive'));
  await f.verify('123456');
  check('right code still works after a wrong one', has(c, 'setActive'));
}
{
  const c = fakeClerk({ existing: true }); const f = createFlow(c);
  await f.start('a@b.co'); await f.resend();
  check('resend asks for a new sign-in code', c.calls.filter(([n]) => n === 'prepareFirstFactor').length === 2);
  const u = fakeClerk(); const g = createFlow(u);
  await g.start('n@b.co'); await g.resend();
  check('resend asks for a new sign-up code', u.calls.filter(([n]) => n === 'prepareEmailAddressVerification').length === 2);
}
{
  const c = fakeClerk({ verifyStatus: 'missing_requirements' }); const f = createFlow(c);
  await f.start('n@b.co');
  const e = await rejects(f.verify('123456'));
  check('a required field turned back on is reported', e && e.code === 'missing_requirements' && !has(c, 'setActive'));
}
{
  const c = fakeClerk({ existing: true, factors: [{ strategy: 'password' }] }); const f = createFlow(c);
  const e = await rejects(f.start('a@b.co'));
  check('an account without email codes is reported', e && e.code === 'no_email_code');
}
check('rate limits read plainly', messageFor(clerkError('too_many_requests')).includes('Wait a minute'));
check('unknown errors fall back', messageFor(new Error('boom')).includes('Try again'));

let pass = 0;
for (const [label, ok] of cases) { if (ok) pass++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); }
console.log(`\n  ${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
