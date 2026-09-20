// The Substack pieces of the ingest and the link resolver, without a network.
//
// Read times are checked against a real profile: the six posts visible on
// Underpriced Actions (garyvee) in the Substack app, with the word counts its
// archive API reports for them. If the formula drifts, the numbers Sona shows
// stop matching the numbers Substack shows, which is the whole point of them.

import { readTime, noteText, normaliseRow } from '../api/ingest.js';
import { youtubeId, substackPostSlug, substackNoteId, isPrivateAddress } from '../api/resolve.js';

const t = [];
const chk = (name, cond) => { t.push(cond); console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`); };
const eq = (name, got, want) =>
  chk(`${name} → ${JSON.stringify(got)}`, got === want) ||
  (got === want ? null : console.log(`        expected ${JSON.stringify(want)}`));

// ─── read time ───
// wordcount → what Substack itself displayed for that post.
const READ_TIMES = [[2189, 9], [1886, 8], [2626, 11], [1685, 7], [2194, 9], [1042, 5]];
for (const [words, minutes] of READ_TIMES) {
  eq(`${words} words`, readTime(words), `${minutes} min read`);
}
eq('no word count', readTime(0), null);
eq('missing word count', readTime(undefined), null);
eq('a one-line post still reads for a minute', readTime(12), '1 min read');

// ─── note text ───
eq('blank lines collapse', noteText('a\n\n\n\nb'), 'a\n\nb');
eq('line breaks survive', noteText('one\ntwo'), 'one\ntwo');
chk('a long note is capped and marked', (() => {
  const out = noteText('x'.repeat(900));
  return out.length === 698 && out.endsWith('…');
})());
eq('empty body', noteText(null), '');

// ─── row shape ───
// PostgREST rejects a bulk insert whose objects do not all carry the same keys,
// so a YouTube row (no read time) next to a Substack row (read time) used to
// fail the whole batch.
const shapes = [
  normaliseRow({ id: 'yt_x', creator_name: 'A', text: 'v' }),
  normaliseRow({ id: 'sub_y', creator_name: 'B', text: 'p', read_time: '7 min read', comments: '67' }),
  normaliseRow({ id: 'note_z', creator_name: 'C', text: 'n', media_type: 'note', publication: 'future/proof' }),
];
const keys = new Set(shapes.map((r) => Object.keys(r).sort().join(',')));
chk('every row has the same columns', keys.size === 1);
eq('a missing field is null, not undefined', shapes[0].read_time, null);
eq('a present field is kept', shapes[1].read_time, '7 min read');
chk('every column is in the list', shapes[2].publication === 'future/proof');

// ─── link parsing ───
const u = (s) => new URL(s);
// The share link Substack and YouTube hand out, tracking parameters and all.
eq('youtu.be with a tracking param', youtubeId(u('https://youtu.be/8-q3ClOYoyA?is=HUjuiVJOgCu9Autg')), '8-q3ClOYoyA');
eq('watch url', youtubeId(u('https://www.youtube.com/watch?v=8-q3ClOYoyA&t=42')), '8-q3ClOYoyA');
eq('shorts', youtubeId(u('https://www.youtube.com/shorts/abc123DEF45')), 'abc123DEF45');
eq('mobile host', youtubeId(u('https://m.youtube.com/watch?v=abc123DEF45')), 'abc123DEF45');
eq('a channel is not a video', youtubeId(u('https://www.youtube.com/@edendotso')), null);
eq('not youtube at all', youtubeId(u('https://vimeo.com/12345')), null);

eq('substack post', substackPostSlug(u('https://garyvee.substack.com/p/document-dont-create')), 'document-dont-create');
eq('custom domain post', substackPostSlug(u('https://letters.thedankoe.com/p/how-to-launch-abc')), 'how-to-launch-abc');
eq('post with a comment anchor', substackPostSlug(u('https://x.substack.com/p/slug?utm_source=x#comments')), 'slug');
eq('an archive page is not a post', substackPostSlug(u('https://garyvee.substack.com/archive')), null);

eq('note', substackNoteId(u('https://substack.com/@thedankoe/note/c-336554742')), '336554742');
eq('note on a profile path', substackNoteId(u('https://substack.com/profile/1-x/note/c-99')), '99');
eq('a profile is not a note', substackNoteId(u('https://substack.com/@thedankoe')), null);

// ─── the resolver fetches a URL a stranger chose ───
for (const ip of ['127.0.0.1', '10.4.4.4', '192.168.1.1', '172.16.0.1', '172.31.255.255',
  '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', 'fe80::1']) {
  chk(`${ip} is refused`, isPrivateAddress(ip));
}
for (const ip of ['1.1.1.1', '8.8.8.8', '172.32.0.1', '171.16.0.1', '2606:4700::1111']) {
  chk(`${ip} is allowed`, !isPrivateAddress(ip));
}

const passed = t.filter(Boolean).length;
console.log(`\n  ${passed}/${t.length} passed`);
process.exit(passed === t.length ? 0 : 1);
