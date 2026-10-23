/* Render an email to a local file so it can be opened in a browser before it is
 * sent. Email HTML has no dev server and no console — the only way to know what
 * a template does is to look at it.
 *
 *   node scripts/preview-email.mjs            → writes both templates
 *   open /tmp/sona-email-broadcast.html
 */
import { writeFileSync } from 'node:fs';
import { welcomeEmail, broadcastEmail, B } from '../api/_email-templates.js';

const issue = broadcastEmail({
  subject: 'Stop guessing. Copy what already works.',
  preheader: 'The 3-part skeleton under every post that hits.',
  title: ['Stop Guessing.', 'Copy What Already Works.'],
  blocks: [
    B.para('Most creators lose reach for one dumb reason: they invent a new hook every single time.'),
    B.para("That's the hardest way to write. You're trying to be original AND effective, simultaneously, from zero, every day. No wonder 90% of posts flop in the first line."),
    B.lead("Here's the fix. Stop inventing. Start decoding."),
    B.para('Every high-performing post — the ones that hit 6 figures of views — follows the same 3-part skeleton:'),
    B.list([
      'A hook that creates tension',
      'A middle that stacks the stakes',
      'A payoff that resolves it',
    ]),
    B.para("The topic changes. The skeleton doesn't. Find one outlier post that crushed it in your niche, rip out the skeleton, and rebuild it with your story."),
    B.label('Theirs:', '&ldquo;I quit my $200K job to sell candles. Here&rsquo;s what nobody tells you about starting over.&rdquo;'),
    B.para('Skeleton = status reversal + insider promise.'),
    B.label('Yours:', '&ldquo;I turned down the promotion to build this newsletter. Here&rsquo;s what nobody tells you about betting on yourself.&rdquo;'),
    B.para("Same engine, different fuel. That's not stealing — that's refusing to reinvent physics every morning."),
    B.lead('Do this today: find 1 outlier post, decode the skeleton, write 1 draft using it.'),
    B.para("Do that 5 times this week and you'll have more proven hooks than 95% of people posting on vibes."),
  ],
  cta: { label: 'Check Sona', href: 'https://buildwithsona.com' },
});

const welcome = welcomeEmail({ email: 'you@example.com' });

for (const [name, mail] of [['broadcast', issue], ['welcome', welcome]]) {
  const path = `/tmp/sona-email-${name}.html`;
  writeFileSync(path, mail.html);
  console.log(`  ${name.padEnd(10)} ${mail.html.length.toString().padStart(6)} bytes html, ${mail.text.length.toString().padStart(5)} bytes text → ${path}`);
}

// Cheap correctness checks that catch the things that actually break a send.
// Every template is checked; only marketing email needs an unsubscribe.
const all = [['broadcast', issue, true], ['welcome', welcome, true]];
console.log('');
let bad = 0;
for (const [name, mail, marketing] of all) {
  const checks = [
    ['subject present',        mail.subject.length > 0],
    ['preheader present',      /max-height:0/.test(mail.html)],
    ['plain-text part',        mail.text.length > 200],
    ['unsubscribe in html',    !marketing || /Unsubscribe/.test(mail.html)],
    ['unsubscribe in text',    !marketing || /Unsubscribe:/.test(mail.text)],
    ['no flexbox or grid',     !/display:\s*(flex|grid)/.test(mail.html)],
    ['tables for layout',      (mail.html.match(/<table/g) || []).length >= 4],
    ['no external css',        !/<link/.test(mail.html)],
    ['no svg images',          !/<svg|\.svg"/.test(mail.html)],
    ['images have alt',        (mail.html.match(/<img(?![^>]*alt=)/g) || []).length === 0],
    ['no unclosed tags',       (mail.html.match(/<table/g)||[]).length === (mail.html.match(/<\/table>/g)||[]).length],
  ];
  for (const [label, ok] of checks) { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(10)} ${label}`); }
}
process.exit(bad ? 1 : 0);
