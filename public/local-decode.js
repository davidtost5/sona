/* Sona — local post analysis.
 *
 * The whole engine that reads a post: hook matching against the template
 * library, structural labelling, and the decode the app's modal renders. It
 * runs entirely in the browser — no network, no model, no API balance — which
 * is why it can sit on a public page and be used by anyone, forever, at zero
 * marginal cost.
 *
 * Shared by /app and the landing page. It lived inline in app.html, where the
 * marketing site could not reach it; the free analysis was locked behind the
 * sign-up gate, which is backwards for the one thing that demonstrates the
 * product.
 *
 * Exposed on window.SonaDecode rather than as a module so both pages can use it
 * with a plain script tag and no build step.
 */
(function () {
  'use strict';

  const HOOKS_LIBRARY = [
    { id:'h1',  cat:'contrarian', pattern:'Most [group] [common belief]. The ones who break out [contrarian move].', eg:'Most founders post more. The ones who break out pick one take and repeat it.' },
    { id:'h2',  cat:'contrarian', pattern:'[Popular thing] isn\'t the problem. [Unexpected thing] is.', eg:'Your funnel isn\'t the problem. Your offer is.' },
    { id:'h3',  cat:'contrarian', pattern:'Everyone tells you to [common advice]. Here\'s why that\'s backwards.', eg:'Everyone tells you to niche down. Here\'s why that\'s backwards at first.' },
    { id:'h4',  cat:'contrarian', pattern:'Stop [thing they over-invest in]. Start [the thing that compounds].', eg:'Stop optimizing your morning. Start optimizing your next 6 hours.' },
    { id:'h5',  cat:'contrarian', pattern:'[Scapegoat] didn\'t kill [thing]. [Real cause] did.', eg:'AI didn\'t kill writing. Lazy writing did.' },
    { id:'h6',  cat:'list',       pattern:'[N] [things] I [do] before [important action]:', eg:'3 questions I ask before writing anything:' },
    { id:'h7',  cat:'list',       pattern:'[N] signs you\'re [state] (and what to do about each):', eg:'5 signs you\'re about to burn out (and the fix for each):' },
    { id:'h8',  cat:'list',       pattern:'[N] [tools/habits/ideas] that [outcome] — ranked:', eg:'7 habits that doubled my output — ranked:' },
    { id:'h9',  cat:'list',       pattern:'I [did X] for [time]. Here are the [N] lessons that actually mattered:', eg:'I posted daily for a year. Here are the 5 lessons that actually mattered:' },
    { id:'h10', cat:'story',      pattern:'[Time] ago I [low point]. Today I [result]. Here\'s what changed:', eg:'Two years ago I had 200 followers. Today I have 50k. Here\'s what changed:' },
    { id:'h11', cat:'story',      pattern:'I almost [gave up / quit] [thing]. Then [small shift]. Now [result].', eg:'I almost deleted my account. Then I changed one thing. Now it\'s my best channel.' },
    { id:'h12', cat:'story',      pattern:'The [post/decision/move] that changed everything took me [absurdly small effort].', eg:'The post that changed everything took me 4 minutes to write.' },
    { id:'h13', cat:'story',      pattern:'Nobody talks about [hard truth of a journey]. Here\'s mine:', eg:'Nobody talks about the lonely middle of building. Here\'s mine:' },
    { id:'h14', cat:'mistake',    pattern:'I wasted [time/money] on [thing] so you don\'t have to. Do [this] instead.', eg:'I wasted 2 years optimizing my system. Just start instead.' },
    { id:'h15', cat:'mistake',    pattern:'The biggest mistake [group] make: [mistake]. Fix: [fix].', eg:'The biggest mistake new writers make: writing for everyone. Fix: write for one person.' },
    { id:'h16', cat:'mistake',    pattern:'You don\'t have [the problem they name]. You have [the real problem].', eg:'You don\'t have writer\'s block. You have input block.' },
    { id:'h17', cat:'mistake',    pattern:'If I started [thing] today, I\'d skip [common mistake] and [do this] first.', eg:'If I started today, I\'d skip the logo and find 10 customers first.' },
    { id:'h18', cat:'framework',  pattern:'The [name] framework for [outcome]: [step 1] → [step 2] → [step 3].', eg:'The 3-A framework for ideas: Absorb → Angle → Assemble.' },
    { id:'h19', cat:'framework',  pattern:'Every [winning output] follows the same shape: [a], [b], [c]. That\'s it.', eg:'Every viral post: bold claim, surprising reason, concrete example. That\'s it.' },
    { id:'h20', cat:'framework',  pattern:'How to [outcome] in [N] steps (steal this):', eg:'How to turn any idea into a thread in 4 steps (steal this):' },
    { id:'h21', cat:'framework',  pattern:'[Outcome] = [input 1] + [input 2] − [common trap].', eg:'Audience growth = consistency + a clear angle − chasing trends.' },
    { id:'h22', cat:'question',   pattern:'What if [common assumption] is the exact thing holding you back?', eg:'What if "more content" is the exact thing holding you back?' },
    { id:'h23', cat:'question',   pattern:'Why do [group] keep [behavior] when [contradiction]?', eg:'Why do founders keep posting daily when one great post a week wins?' },
    { id:'h24', cat:'question',   pattern:'Ever notice how [observation]? Here\'s what\'s really going on:', eg:'Ever notice the best posts feel effortless? Here\'s what\'s really going on:' },
    { id:'h25', cat:'curiosity',  pattern:'The one [thing] that changed how I think about [broad activity]:', eg:'The one essay format that changed how I think about everything I publish.' },
    { id:'h26', cat:'curiosity',  pattern:'Here\'s the part of [popular topic] nobody tells you:', eg:'Here\'s the part of "build in public" nobody tells you:' },
    { id:'h27', cat:'curiosity',  pattern:'I found a [pattern] hiding in [N] [examples]. It explains [outcome].', eg:'I found a pattern hiding in 100 viral posts. It explains why they spread.' },
    { id:'h28', cat:'curiosity',  pattern:'[Specific number] changed my mind about [topic]:', eg:'One number changed my mind about posting frequency:' },
    { id:'h29', cat:'contrarian', pattern:'Unpopular opinion: [stance most disagree with]. Here\'s the case:', eg:'Unpopular opinion: consistency is overrated without an angle. Here\'s the case:' },
    { id:'h30', cat:'list',       pattern:'Save this: [N] [things] for [outcome].', eg:'Save this: 8 hooks for your next 8 posts.' },
    { id:'h31', cat:'story',      pattern:'[Authority figure] told me [advice]. They were [right/wrong]. Here\'s why:', eg:'A mentor told me to post less. They were right. Here\'s why:' },
    { id:'h32', cat:'framework',  pattern:'Before you [action], run this [N]-question check:', eg:'Before you hit publish, run this 3-question check:' },
    { id:'h33', cat:'mistake',    pattern:'Stop chasing [vanity metric]. Start chasing [the real thing].', eg:'Stop chasing followers. Start chasing the right 100 people.' },
    { id:'h34', cat:'curiosity',  pattern:'[Big result] came from [tiny, boring habit]. Let me explain:', eg:'My best month came from one boring 15-minute habit. Let me explain:' },
    { id:'h35', cat:'question',   pattern:'How much of your [thing] is actually [reframed cause]?', eg:'How much of your "time problem" is actually a courage problem?' },
    { id:'h36', cat:'contrarian', pattern:'The best [group] aren\'t the [expected trait]. They\'re the most [unexpected trait].', eg:'The best founders aren\'t the smartest. They\'re the most shameless.' },
  ];

  const IR_STOP = new Set("a an the and or but if of to in on for with is are was were be been it its this that you your i my we our they them he she as at by from so than then there here what how why when who".split(' '));
  const irTokens = t => String(t).toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter(Boolean);
  const irContent = t => irTokens(t).filter(w => !IR_STOP.has(w) && w.length > 2);

  // A hook template carries its signature in the words OUTSIDE the [brackets].
  // Keeping their order lets a sequential match score higher than a coincidental
  // bag-of-words overlap.
  function irSkeleton(pattern) {
    return irTokens(String(pattern).replace(/\[[^\]]*\]/g, ' § ')).filter(w => w !== '§');
  }

  function irMatchHooks(text, topN) {
    const words = irTokens(text);
    const set = new Set(words);
    const cw = irContent(text);
    const scored = (typeof HOOKS_LIBRARY !== 'undefined' ? HOOKS_LIBRARY : []).map(h => {
      const skel = irSkeleton(h.pattern);
      if (!skel.length) return { h, score: 0 };
      let hit = 0, lastIdx = -1, inOrder = 0;
      for (const w of skel) {
        if (!set.has(w)) continue;
        hit++;
        const idx = words.indexOf(w, lastIdx + 1);
        if (idx > lastIdx) { inOrder++; lastIdx = idx; }
      }
      const eg = new Set(irContent(h.eg || ''));
      const shared = cw.filter(w => eg.has(w)).length;
      const egSim = eg.size ? shared / Math.min(eg.size, Math.max(cw.length, 1)) : 0;
      const raw = (hit / skel.length) * 0.55 + (inOrder / skel.length) * 0.30 + egSim * 0.15;
      // A two-word skeleton matches almost anything — "[N] things I do before
      // [x]" reduces to ["i","before"], and two common-word hits scored it 0.73,
      // above the contrarian template that actually fit. Ratios over tiny
      // denominators are not evidence, so confidence scales with how much
      // skeleton there was to match against.
      const evidence = Math.min(1, skel.length / 4);
      return { h, score: raw * evidence };
    });
    return scored.filter(x => x.score > 0.18).sort((a, b) => b.score - a.score).slice(0, topN || 3);
  }

  function irStructure(text) {
    const t = String(text).trim();
    const sentences = t.split(/(?<=[.!?])\s+/).filter(x => x.trim().length > 1);
    const words = irTokens(t);
    const first = (sentences[0] || t).trim();
    const specifics = (t.match(/\b\d[\d,.]*\s?(?:%|k|m|x|×)?\b/gi) || []).length
                    + (t.match(/[$£€]\s?\d[\d,.]*\s?[kmb]?/gi) || []).length;
    let opening = 'Statement';
    if (/^\d|^(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(first)) opening = 'Number-led';
    else if (/\?$/.test(first)) opening = 'Question';
    else if (/^(most|everyone|nobody|stop|don'?t|never|forget|unpopular)\b/i.test(first)) opening = 'Contrarian';
    else if (/^i\b|^my\b|^we\b/i.test(first)) opening = 'Personal';
    return {
      words: words.length,
      avgSentence: sentences.length ? Math.round(words.length / sentences.length) : 0,
      firstLineWords: irTokens(first).length,
      opening, specifics,
      // Specifics bracketed out — a reusable skeleton, computed locally.
      template: t.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ')
        .replace(/[$£€]\s?\d[\d,.]*\s?[kmb]?/gi, '[amount]')
        .replace(/\b\d[\d,.]*\s?(?:%|k|m|x|×)\b/gi, '[number]')
        .replace(/\b\d[\d,.]*\b/g, '[number]'),
    };
  }


  // ─── Local decode ───
  // Produces the same {hook, tension, payoff, pattern, why, apply} shape the
  // decoder modal renders, computed entirely in the browser. No network, no
  // model, no credit — so it works on every post in the feed, forever, and it
  // cannot 502.
  //
  // The honesty line matters: this does not claim to know why a post worked.
  // It reports what the post structurally IS — where it turns, how specific it
  // is, what skeleton it leaves behind — and lets the reader draw the causal
  // conclusion. Every claim below is measured from the text itself.

  // Words that mark the sentence where a post changes direction. This is the
  // single most useful structural signal in short-form writing: the turn is
  // where the reader decides to keep going.
  const LD_PIVOT = /^(but|however|until|then|yet|except|instead|turns out|the problem|the truth|here'?s|so |and yet|that changed|what nobody|most people|everyone)/i;
  const LD_CTA = /(follow|subscribe|comment|share|link in|dm me|sign up|join|check out|read more|full breakdown)/i;

  function ldSentences(text) {
    return String(text).trim()
      .split(/\n+|(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 1);
  }

  function ldLabel(sentences) {
    // Assigns each sentence a structural role. Order matters more than keywords:
    // the first line is always the hook, the last is always the landing.
    return sentences.map((s, idx) => {
      if (idx === 0) return { s, role: 'Hook' };
      if (LD_CTA.test(s) && idx >= sentences.length - 2) return { s, role: 'Ask' };
      if (idx === sentences.length - 1) return { s, role: 'Landing' };
      if (LD_PIVOT.test(s)) return { s, role: 'Turn' };
      if (/\d/.test(s)) return { s, role: 'Proof' };
      return { s, role: 'Context' };
    });
  }

  function localDecode(text, meta) {
    const t = String(text || '').trim();
    const sentences = ldSentences(t);
    if (!sentences.length) {
      return { hook: '—', tension: 'Nothing to read here yet.', payoff: '—',
               pattern: '—', why: 'Paste a post to see its shape.', apply: '—' };
    }

    const st = irStructure(t);
    const labelled = ldLabel(sentences);
    const turn = labelled.find(x => x.role === 'Turn');
    const proof = labelled.filter(x => x.role === 'Proof');
    const landing = labelled[labelled.length - 1];
    const match = irMatchHooks(t, 1)[0];

    // ── hook ── what the opening does, plus the library template it echoes
    const hookBits = [`${st.opening} opener, ${st.firstLineWords} words.`];
    // Naming a shape the post doesn't actually have reads worse than naming
    // none, so a weak match stays quiet.
    if (match && match.score >= 0.35) {
      hookBits.push(`Closest known shape: ${match.h.cat} — "${match.h.pattern}"`);
    }
    const hook = `${sentences[0]}\n\n${hookBits.join(' ')}`;

    // ── tension ── where it turns, or an honest note that it doesn't
    const tension = turn
      ? `Turns at: "${turn.s}"`
      : sentences.length > 2
        ? 'No explicit turn — it builds in one direction the whole way. That works when the opening promise is strong enough to carry it.'
        : 'Too short to have a turn. Single-beat post.';

    // ── payoff ── where it lands
    const payoff = `Lands on: "${landing.s}"${
      LD_CTA.test(landing.s) ? '\n\nEnds on an ask rather than an idea.' : ''}`;

    // ── pattern ── the reusable skeleton, specifics bracketed out
    const pattern = st.template || sentences.slice(0, 2).join(' ');

    // ── why ── measurable observations only
    const shape = labelled.map(x => x.role);
    const why = [
      `Structure: ${shape.join(' → ')}`,
      `${st.words} words, ~${st.avgSentence} per sentence.`,
      st.specifics
        ? `${st.specifics} concrete number${st.specifics === 1 ? '' : 's'} — specificity is doing work here.`
        : 'No numbers anywhere. It runs on assertion, which needs a stronger opening to survive.',
      st.firstLineWords <= 12
        ? 'Short first line — it gets read before anyone decides to scroll.'
        : 'Long first line — it asks for commitment before it has earned any.',
    ].join('\n');

    // ── apply ── a fill-in-the-blank version of this exact post
    const apply = [
      `1. Open ${st.opening.toLowerCase()}, in ${st.firstLineWords} words or fewer.`,
      turn ? '2. Turn it once, roughly halfway.' : '2. Hold one direction — no turn.',
      proof.length ? `3. Carry ${proof.length} concrete detail${proof.length === 1 ? '' : 's'}.`
                   : '3. Add one concrete detail; this post has none.',
      `4. Land on ${LD_CTA.test(landing.s) ? 'an ask' : 'the idea, not an ask'}.`,
    ].join('\n');

    return { hook, tension, payoff, pattern, why, apply };
  }

  window.SonaDecode = {
    decode: localDecode,
    structure: irStructure,
    matchHooks: irMatchHooks,
    hooks: HOOKS_LIBRARY,
  };
})();
