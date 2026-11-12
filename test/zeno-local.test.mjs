// Zeno without an API: it answers from the feed, the hooks library and the
// decode engine, and never invents a post or writes one for you.
import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(new URL('../public/local-decode.js', import.meta.url), 'utf8'));
await import('../public/zeno-local.js');

const FEED = [
  { id: 'a', name: 'Alex Hormozi', handle: '@AlexHormozi · X', cat: 'founders', tag: '12× outlier', views: '1.2M views', text: 'Most founders post too much, not too little. The ones who break out pick one contrarian take and stick to it.', decoded: { hook: 'Contrarian counter' } },
  { id: 'b', name: 'Tyler Denk', handle: '@denk_tweets · X', cat: 'founders', tag: '5× outlier', text: 'Today was the biggest day in beehiiv history. We launched Community: newsletter, podcast, website.' },
  { id: 'c', name: 'Sahil Bloom', handle: '@SahilBloom · X', cat: 'writers', tag: '3× outlier', text: 'Your life has seasons. Each one is unique: its own desires, struggles and identity.' },
  { id: 'd', name: 'Justin Welsh', handle: '@justinwelsh · LinkedIn', cat: 'creators', tag: '3× outlier', text: 'Pricing is a signal. Charge more and you attract better clients.' },
];
const zeno = window.SonaZeno.create({
  feed: () => FEED,
  decoder: window.SonaDecode,
  playbook: () => ({ bannedPhrases: 'game-changer, leverage', hookPatterns: 'Your [thing] has seasons too.' }),
});

const cases = [];
const check = (label, ok) => cases.push([label, Boolean(ok)]);

let r = zeno.answer("What's beating the average for founders right now?");
check('niche search returns only that niche', r.posts.length === 2 && r.posts.every(p => ['Alex Hormozi', 'Tyler Denk'].includes(p.creator)));
check('strongest post leads', r.posts[0].creator === 'Alex Hormozi' && /Alex Hormozi\*\*, at 12×/.test(r.text));

r = zeno.answer('Show me posts about pricing');
check('topic search finds the matching post', r.posts[0] && r.posts[0].creator === 'Justin Welsh');

r = zeno.answer('what is Sahil Bloom doing');
check('a named creator wins', r.posts[0] && r.posts[0].creator === 'Sahil Bloom');

r = zeno.answer('posts about quantum knitting');
check('no match says so and offers the strongest instead', /Nothing in the feed matches/.test(r.text) && r.posts.length > 0);

r = zeno.answer('Give me three hooks for a post about pricing, based on posts that worked.');
const listed = (r.text.match(/^\d\. /gm) || []).length;
check('three hooks', listed === 3);
check('hooks name the topic', /about \*\*pricing\*\*/.test(r.text));
check('hooks come from the library', window.SonaDecode.hooks.some(h => r.text.includes(h.pattern)));
check('playbook hook mentioned', /Your playbook also has 1 hook/.test(r.text));
check('different topics, different hooks', zeno.answer('three hooks about hiring').text !== zeno.answer('three hooks about burnout').text);

r = zeno.answer('Decode this post:\n\nI deleted 80% of my todo list last month. Output went up 3x. Here is the framework I used.');
check('decode names hook, turn, landing', /\*\*Hook\.\*\*/.test(r.text) && /\*\*Turn\.\*\*/.test(r.text) && /\*\*Where it lands\.\*\*/.test(r.text));

r = zeno.answer("Here's my draft. What one change would make it land harder?\n\nThis is a total game-changer for anyone who wants to leverage their time better and actually get somewhere meaningful this year. Follow me for more.");
check('critique flags the never-say list first', /\*\*The one change:\*\* It uses “game-changer”, “leverage”/.test(r.text));
check('critique never rewrites', /won't rewrite it/.test(r.text) || /won\\'t rewrite/.test(r.text));

r = zeno.answer("Here's my draft. What one change would make it land harder?");
check('critique without a draft asks for it', /Paste your draft/.test(r.text));

r = zeno.answer('hi');
check('greeting explains what Zeno does', /Find posts/.test(r.text) && /4 posts right now/.test(r.text));

let pass = 0;
for (const [label, ok] of cases) { if (ok) pass++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); }
console.log(`\n  ${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
