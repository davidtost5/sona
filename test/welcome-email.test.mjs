// The sign-up welcome email: who it goes to, and that the HTML is safe to send.
import { welcomeTarget } from '../api/clerk-webhook.js';
import { accountWelcomeEmail, welcomeEmail } from '../api/_email-templates.js';

const user = (over = {}) => ({
  id: 'user_1', first_name: 'David', primary_email_address_id: 'e2',
  email_addresses: [{ id: 'e1', email_address: 'old@example.com' }, { id: 'e2', email_address: 'david@example.com' }],
  ...over,
});

const cases = [];
const check = (label, ok) => cases.push([label, Boolean(ok)]);

check('picks the primary address', welcomeTarget(user())?.email === 'david@example.com');
check('falls back to the first address', welcomeTarget(user({ primary_email_address_id: 'nope' }))?.email === 'old@example.com');
check('keeps the first name', welcomeTarget(user())?.firstName === 'David');
check('no addresses -> null', welcomeTarget(user({ email_addresses: [] })) === null);
check('not an address -> null', welcomeTarget(user({ email_addresses: [{ id: 'e2', email_address: 'nope' }] })) === null);
check('missing data -> null', welcomeTarget(undefined) === null);

const mail = accountWelcomeEmail({ firstName: 'David', email: 'david@example.com' });
check('subject greets by name', mail.subject === 'Welcome to Sona, David');
check('has a plain-text part', mail.text.length > 400 && mail.text.split('\n').includes('Open Sona: https://buildwithsona.com/app'));
check('one blue Open Sona button', (mail.html.match(/Open Sona &rarr;/g) || []).length === 1);
check('no flexbox or grid', !/display:\s*(flex|grid)/.test(mail.html));
check('no svg', !/<svg|\.svg"/.test(mail.html));
check('every img has alt', !/<img(?![^>]*alt=)/.test(mail.html));
check('tables balance', (mail.html.match(/<table/g) || []).length === (mail.html.match(/<\/table>/g) || []).length);
check('no green left', !/#28775c/i.test(mail.html));

const evil = accountWelcomeEmail({ firstName: '<img src=x onerror=alert(1)>', email: 'a@b.co' });
check('a name with markup is not rendered as html', !evil.html.includes('<img src=x'));
check('a long name falls back to no name', accountWelcomeEmail({ firstName: 'x'.repeat(60) }).subject === 'Welcome to Sona');
check('no name reads naturally', accountWelcomeEmail({}).html.includes('Hi,'));

const list = welcomeEmail({ email: 'a@b.co' });
check('waitlist email keeps its unsubscribe', /Unsubscribe/.test(list.html) && /Unsubscribe:/.test(list.text));

let pass = 0;
for (const [label, ok] of cases) { if (ok) pass++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); }
console.log(`\n  ${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
