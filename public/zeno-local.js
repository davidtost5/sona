/* Zeno, run entirely in the browser.
 *
 * No model, no API key, no network. Zeno answers from what Sona already has:
 * the posts in the feed, the hooks library, the decode engine in
 * local-decode.js and the person's playbook. Every sentence it writes is built
 * from something it measured or looked up, so it can't make things up, and it
 * never writes a post for anyone.
 *
 *   var zeno = SonaZeno.create({
 *     feed: () => SEED_IDEAS,               // posts: {id, name, handle, text, tag, views, cat, url, decoded?}
 *     decoder: window.SonaDecode,           // {decode, structure, matchHooks, hooks}
 *     playbook: () => styleGuide,           // {voiceRules, bannedPhrases, hookPatterns, signatureLines}
 *   });
 *   zeno.answer('Give me hooks about pricing') → { text, posts, search }
 *
 * `text` is light markdown (paragraphs, **bold**, "- " lists, "1. " lists),
 * the same subset the Home chat renders. `posts` are the sources it used.
 */
(function (root) {
  'use strict';

  var NICHES = { founder: 'founders', founders: 'founders', startup: 'founders', startups: 'founders',
    writer: 'writers', writers: 'writers', writing: 'writers', newsletter: 'writers',
    creator: 'creators', creators: 'creators', audience: 'creators' };
  var STOP = ('a an and are as at be but by can do does for from get give have how i if in into is it its just me '
    + 'more most my of on or our out post posts right show some tell than that the their them then there these '
    + 'they this to up us was what whats when which who why will with would you your about any based worked '
    + 'working work now best top good great beating beat beats average outliers outlier feed sona zeno please '
    + 'find look looking see three five ten hook hooks opening openings ideas idea write writing draft').split(' ');
  var STOPSET = {};
  STOP.forEach(function (w) { STOPSET[w] = true; });

  function words(s) {
    return (String(s || '').toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g) || [])
      .map(function (w) { return w.replace(/['’]s$/, '').replace(/['’]/g, ''); });
  }
  function topicWords(s) {
    return words(s).filter(function (w) { return w.length > 2 && !STOPSET[w] && !NICHES[w]; });
  }
  function multipleOf(p) {
    var m = /([\d.]+)\s*×/.exec(p.tag || '');
    return m ? parseFloat(m[1]) : 0;
  }
  function plainHandle(h) { return String(h || '').split('·')[0].trim(); }
  function clip(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;
  }
  function firstSentence(s) {
    var m = /^[^\n]*?[.!?](?=\s|$)|^[^\n]+/.exec(String(s || '').trim());
    return m ? m[0] : String(s || '');
  }
  function source(p) {
    return { id: p.id, creator: p.name, handle: plainHandle(p.handle), multiple: p.tag || '', text: clip(p.text, 220), url: p.url || '' };
  }
  function pasted(question) {
    // Anything after the first blank line, or after "this post:" style lead-ins,
    // is the text the person pasted.
    var q = String(question || '');
    var split = q.split(/\n\s*\n/);
    if (split.length > 1) return split.slice(1).join('\n\n').trim();
    var m = /(?:this post|my draft|this draft|this)\s*[:\-]\s*([\s\S]{20,})$/i.exec(q);
    return m ? m[1].trim() : '';
  }

  function create(opts) {
    var feed = function () { return (opts.feed && opts.feed()) || []; };
    var D = opts.decoder || {};
    var playbook = function () { return (opts.playbook && opts.playbook()) || {}; };

    // ── Searching the feed ──
    function search(question) {
      var ws = words(question);
      var niche = null;
      ws.some(function (w) { if (NICHES[w]) { niche = NICHES[w]; return true; } return false; });
      var topics = topicWords(question);
      var posts = feed();
      // A creator named in the question wins outright.
      var byCreator = posts.filter(function (p) {
        var name = String(p.name || '').toLowerCase(), handle = plainHandle(p.handle).toLowerCase().replace(/^@/, '');
        return topics.some(function (t) { return t.length > 3 && (name.split(/\s+/).indexOf(t) !== -1 || handle === t); });
      });
      var scored = (byCreator.length ? byCreator : posts)
        .filter(function (p) { return !niche || p.cat === niche; })
        .map(function (p) {
          var hay = words(p.text + ' ' + p.name);
          var hits = byCreator.length ? 1 : topics.filter(function (t) {
            return hay.some(function (h) { return h === t || (t.length > 4 && h.indexOf(t.slice(0, -1)) === 0); });
          }).length;
          return { p: p, hits: hits, m: multipleOf(p) };
        });
      var matched = topics.length && !byCreator.length ? scored.filter(function (s) { return s.hits > 0; }) : scored;
      matched.sort(function (a, b) { return (b.hits - a.hits) || (b.m - a.m); });
      return { niche: niche, topics: topics, creator: byCreator.length ? byCreator[0].name : '', items: matched.map(function (s) { return s.p; }) };
    }

    function shapeOf(p) {
      var st = D.structure ? D.structure(p.text) : null;
      return st ? st.opening : '';
    }

    function answerFind(question) {
      var r = search(question);
      var label = r.creator ? r.creator
        : (r.topics.length ? '“' + r.topics.join(' ') + '”' : '') + (r.niche ? (r.topics.length ? ' for ' : '') + r.niche : '');
      if (!r.items.length) {
        var nearby = feed().slice().sort(function (a, b) { return multipleOf(b) - multipleOf(a); }).slice(0, 3);
        return {
          search: label || 'the feed',
          text: 'Nothing in the feed matches ' + (label || 'that') + ' yet. The feed holds ' + feed().length
            + ' posts right now, so a narrower topic often comes back empty.\n\nHere are the strongest posts in it instead. Try a broader word, a creator\'s name, or one of: founders, writers, creators.',
          posts: nearby.map(source),
        };
      }
      var top = r.items.slice(0, 4);
      var best = top[0];
      var shapes = {};
      top.forEach(function (p) { var s = shapeOf(p); if (s) shapes[s] = (shapes[s] || 0) + 1; });
      var common = Object.keys(shapes).sort(function (a, b) { return shapes[b] - shapes[a]; })[0];
      var lines = [];
      lines.push((r.items.length === 1 ? 'One post' : r.items.length + ' posts') + ' in the feed match' + (r.items.length === 1 ? 'es ' : ' ') + (label || 'that') + '. The strongest is **' + best.name + '**, at ' + (multipleOf(best) || '?') + '× their usual:');
      lines.push('“' + clip(firstSentence(best.text), 160) + '”');
      var list = top.map(function (p) {
        var hook = (p.decoded && p.decoded.hook) ? p.decoded.hook : (shapeOf(p) ? shapeOf(p) + ' opening' : '');
        return '- **' + p.name + '**, ' + (multipleOf(p) || '?') + '×' + (hook ? ': ' + hook.toLowerCase() : '');
      });
      lines.push(list.join('\n'));
      if (common && shapes[common] > 1) {
        lines.push('What they share: ' + shapes[common] + ' of these open with a **' + common.toLowerCase() + '** first line.'
          + (common === 'Contrarian' ? ' They push against what the reader already believes.' : common === 'Personal' ? ' They start from something that happened to the writer.' : common === 'Number-led' ? ' A number in the first line makes the promise concrete.' : ''));
      }
      lines.push('Open one with Decode to see its hook, the turn and the line you can reuse.');
      return { search: label || 'the feed', text: lines.join('\n\n'), posts: top.map(source) };
    }

    // ── Hooks ──
    var CAT_WORDS = { contrarian: /contrarian|bold|hot take|unpopular/, list: /list|steps|tips|numbered/, story: /story|personal|journey/, mistake: /mistake|lesson|wrong/, framework: /framework|system|process|how to/, question: /question/, curiosity: /curious|curiosity|secret/ };
    function answerHooks(question) {
      var lib = D.hooks || [];
      var q = String(question).toLowerCase();
      var topic = (/(?:about|on|for)\s+(?:a\s+post\s+about\s+)?([a-z0-9 '’-]{2,40}?)(?:[,.?!]|\s+based\b|\s+that\b|$)/.exec(q) || [])[1] || '';
      topic = topic.replace(/^(a|an|the|my)\s+/, '').replace(/\s+post$/, '').trim();
      var nm = /\b(\d|one|two|three|four|five|six|seven)\b/.exec(q);
      var n = nm ? ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }[nm[1]] || parseInt(nm[1], 10)) : 3;
      n = Math.max(1, Math.min(6, n || 3));
      var wantCat = Object.keys(CAT_WORDS).filter(function (c) { return CAT_WORDS[c].test(q); })[0];
      var pool = wantCat ? lib.filter(function (h) { return h.cat === wantCat; }) : lib.slice();
      // Spread the picks across categories, and rotate by topic so different
      // topics don't always get the same three.
      var seed = 0; String(topic || q).split('').forEach(function (c) { seed = (seed * 31 + c.charCodeAt(0)) % 997; });
      var byCat = {};
      pool.forEach(function (h) { (byCat[h.cat] = byCat[h.cat] || []).push(h); });
      var cats = Object.keys(byCat);
      var picks = [];
      for (var i = 0; picks.length < n && i < pool.length * 2; i++) {
        var list = byCat[cats[(seed + i) % cats.length]];
        var h = list[(seed + Math.floor(i / cats.length)) % list.length];
        if (picks.indexOf(h) === -1) picks.push(h);
      }
      var mine = (playbook().hookPatterns || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      var lines = [];
      lines.push(picks.length + ' opening' + (picks.length === 1 ? '' : 's') + (topic ? ' you could shape for a post about **' + topic + '**' : '') + ', from Sona\'s library of hooks that already worked. Fill the brackets with your own specifics:');
      var end = function (s) { s = String(s).replace(/[:\s]+$/, ''); return /[.!?]$/.test(s) ? s : s + '.'; };
      lines.push(picks.map(function (h, k) { return (k + 1) + '. ' + end(h.pattern) + ' For example: “' + end(h.eg) + '”'; }).join('\n'));
      if (mine.length) lines.push('Your playbook also has ' + mine.length + ' hook' + (mine.length === 1 ? '' : 's') + ' of your own. The first: “' + clip(mine[0], 120) + '”');
      lines.push('The words are yours to write. Pick the one that fits something you actually believe or did, and keep the first line short.');
      var r = search(topic || question);
      var backing = r.items.filter(function (p) { return multipleOf(p) > 0; }).slice(0, 2);
      return { search: topic ? 'hooks about ' + topic : 'the hooks library', text: lines.join('\n\n'), posts: backing.map(source) };
    }

    // ── Decode a pasted post ──
    function answerDecode(text) {
      var d = D.decode ? D.decode(text) : null;
      if (!d) return { text: 'Paste the post after your message and I\'ll take it apart.', posts: [] };
      var st = D.structure ? D.structure(text) : null;
      var match = D.matchHooks ? (D.matchHooks(text, 1) || [])[0] : null;
      var lines = [];
      lines.push('**Hook.** ' + d.hook.split('\n\n').pop());
      lines.push('**Turn.** ' + d.tension);
      lines.push('**Where it lands.** ' + d.payoff.split('\n\n')[0]);
      if (d.pattern && d.pattern !== '—') lines.push('**Reusable line.** ' + d.pattern);
      lines.push('**Shape.**\n' + d.why.split('\n').map(function (l) { return '- ' + l; }).join('\n'));
      if (match && match.score >= 0.35) lines.push('Closest known hook: ' + match.h.pattern);
      if (st && st.firstLineWords > 14) lines.push('One thing to try: the first line is ' + st.firstLineWords + ' words. Most outliers in the feed open in under a dozen.');
      return { search: 'your post', text: lines.join('\n\n'), posts: [] };
    }

    // ── Critique a draft ──
    function answerCritique(text) {
      if (!text) {
        return { text: 'Paste your draft after your question, on a new line, and I\'ll point to the one change that would matter most.', posts: [] };
      }
      var st = D.structure ? D.structure(text) : { firstLineWords: words(firstSentence(text)).length, opening: 'Statement', specifics: 0, words: words(text).length };
      var pb = playbook();
      var banned = String(pb.bannedPhrases || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      var low = text.toLowerCase();
      var hits = banned.filter(function (b) { return b && low.indexOf(b) !== -1; });
      var cta = /(follow|subscribe|comment|share|link in|dm me|sign up|join|check out|read more)/i.test(text.split(/\n+/).slice(-2).join(' '));
      var issues = [];
      if (hits.length) issues.push({ w: 5, t: 'It uses ' + hits.map(function (h) { return '“' + h + '”'; }).join(', ') + ', which ' + (hits.length === 1 ? 'is' : 'are') + ' on your never-say list. Take ' + (hits.length === 1 ? 'it' : 'them') + ' out first.' });
      if (st.firstLineWords > 14) issues.push({ w: 4, t: 'The first line is ' + st.firstLineWords + ' words. It has to earn the next line on its own; cut it to about ten words and move the rest down.' });
      if (st.opening === 'Statement' && st.firstLineWords > 8) issues.push({ w: 2, t: 'The opening states something without tension. Try starting with what most people get wrong, a number, or the moment it happened to you.' });
      if (!st.specifics) issues.push({ w: 3, t: 'There isn\'t a single number or concrete detail. Add one specific: a time, an amount, a name. Specifics make a claim believable.' });
      if (cta) issues.push({ w: 2, t: 'It ends on an ask. Outliers usually end on the idea; let the last line be the thought you want them to keep.' });
      if (st.words > 220) issues.push({ w: 1, t: 'At ' + st.words + ' words it is long for a short-form post. Cut anything that repeats the hook.' });
      issues.sort(function (a, b) { return b.w - a.w; });
      var lines = [];
      if (!issues.length) {
        lines.push('This holds up: a short first line, at least one specific, and it ends on the idea rather than an ask. The one thing I can\'t check is whether it\'s true to you, so read it out loud once before you post.');
      } else {
        lines.push('**The one change:** ' + issues[0].t);
        if (issues.length > 1) lines.push('Smaller things after that:\n' + issues.slice(1, 3).map(function (i) { return '- ' + i.t; }).join('\n'));
      }
      lines.push('I won\'t rewrite it for you. These are the checks; the words stay yours.');
      return { search: 'your draft', text: lines.join('\n\n'), posts: [] };
    }

    function answerHelp() {
      return {
        text: 'I read Sona\'s feed and your playbook, and I can:\n\n- **Find posts** that beat their creator\'s average, by niche, topic or creator. Try “what\'s working for founders?”\n- **Suggest openings** from the hooks library. Try “three hooks about pricing”.\n- **Decode a post** you paste: the hook, the turn, where it lands and the line to reuse.\n- **Critique your draft** and name the one change that matters most.\n\nI don\'t write posts for you, and I only know what\'s in the feed (' + feed().length + ' posts right now).',
        posts: [],
      };
    }

    function answer(question) {
      var q = String(question || '').trim();
      var lower = q.toLowerCase();
      var body = pasted(q);
      if (!q) return answerHelp();
      if (/^(hi|hey|hello|help|what can you do|who are you)\b/.test(lower) && q.length < 40) return answerHelp();
      if (/\b(critique|feedback|review|improve|land harder|one change|my draft)\b/.test(lower)) return answerCritique(body);
      if (/\bdecode\b/.test(lower) || (body && body.length > 80)) return answerDecode(body || q.replace(/^decode( this)?( post)?\s*[:\-]?\s*/i, ''));
      if (/\bhooks?\b|\bopenings?\b|\bfirst lines?\b|\bhow (do|should) i (start|open)\b/.test(lower)) return answerHooks(q);
      return answerFind(q);
    }

    return { answer: answer, search: search };
  }

  root.SonaZeno = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
