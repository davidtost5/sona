// Hero Discover demo — the real thing, not a picture of it.
//
// Same data, same decodes and same find → understand → make-it-yours loop the
// studio runs. Nine posts are embedded rather than fetched: the hero is above
// the fold, so it must paint instantly, and a homepage fetch would cost a
// serverless invocation per visitor for content that doesn't need to be fresh.
//
// Every decode below is hand-written and ships in the app. Nothing here calls
// /api/decode — that needs ANTHROPIC_API_KEY and would 503 on the marketing
// site — so nothing shown is generated on the fly or faked.

(function () {
  const panel = document.getElementById('hero-panel');
  if (!panel) return;
  const grid = panel.querySelector('.shot-cards');
  const chips = panel.querySelectorAll('.shot-chips span');
  const head = panel.querySelector('.shot-head span');
  if (!grid) return;

  const POSTS = [
    {
      "id": "i1",
      "cat": "founders",
      "name": "Alex Hormozi",
      "handle": "@AlexHormozi · X",
      "text": "Most founders post too much — not too little. The ones who break out pick one contrarian take and stick to it.",
      "tag": "12× outlier",
      "views": "1.2M views",
      "decoded": {
        "hook": "Contrarian counter",
        "why": "Opens with a category most people belong to, then strips out 99% of them. The reader self-identifies into the elite 1%.",
        "pattern": "Most [group] [common belief]. The ones who break out [contrarian action].",
        "apply": "Most [your audience] [common belief in your niche]. The ones who break out [your differentiator — the unsexy thing that actually works]."
      }
    },
    {
      "id": "i2",
      "cat": "founders",
      "name": "Hala Taha",
      "handle": "@halataha · in",
      "text": "I deleted 80% of my todo list last month. Output went up 3×. Here's the framework I used.",
      "tag": "8× outlier",
      "views": "840K views",
      "decoded": {
        "hook": "Specific number + counterintuitive outcome",
        "why": "Two specific numbers (80%, 3×) anchor credibility. \"Here's the framework\" is a content debt the reader will collect.",
        "pattern": "I [aggressive cut]. [Counterintuitive result] went up [number]×. Here's the framework.",
        "apply": "I deleted [aggressive % of something you do]. [The thing that actually matters] went up [number]×. Here's the framework."
      }
    },
    {
      "id": "i7",
      "cat": "founders",
      "name": "Sahil Lavingia",
      "handle": "@shl · X",
      "text": "Specific knowledge is found by pursuing your genuine curiosity, not by following whatever is trendy.",
      "tag": "22× outlier",
      "views": "1.5M views",
      "decoded": {
        "hook": "Quiet philosophical truth",
        "why": "Short, declarative, no exclamation. The contrast does the work. Naval-style: aphoristic, screenshot-able.",
        "pattern": "[Valuable thing] is found by [hard but authentic path], not by [easy but crowded path].",
        "apply": "[The thing your audience wants] is found by [the unsexy authentic path], not by [the shiny crowded one]."
      }
    },
    {
      "id": "i3",
      "cat": "writers",
      "name": "Dan Koe",
      "handle": "@thedankoe · X",
      "text": "Three questions I ask before writing anything. They've saved me hundreds of bad drafts.",
      "tag": "18× outlier",
      "views": "2.4M views",
      "decoded": {
        "hook": "Numbered list promise",
        "why": "Small number = manageable. \"Bad drafts\" is the reader's private fear. The pattern works for any process the reader already does.",
        "pattern": "[Small number] [thing you do] before [important action]. They've saved me [big specific cost].",
        "apply": "Three [things] I [do] before [creative act]. They've saved me [pain you avoided]."
      }
    },
    {
      "id": "i6",
      "cat": "writers",
      "name": "Greg Isenberg",
      "handle": "@gregisenberg · in",
      "text": "The one essay format that changed how I think about everything I publish.",
      "tag": "9× outlier",
      "views": "690K views",
      "decoded": {
        "hook": "Singular-discovery promise",
        "why": "Singular + transformation. \"Everything I publish\" widens the relevance from this post to all the reader's future work.",
        "pattern": "The one [format / question / habit] that changed how I think about [broad activity].",
        "apply": "The one [framework] that changed how I think about [the activity your audience repeats weekly]."
      }
    },
    {
      "id": "i14",
      "cat": "writers",
      "name": "Dickie Bush",
      "handle": "@dickiebush · X",
      "text": "You don't have writer's block. You have input block. Read more, live more, and the words show up.",
      "tag": "12× outlier",
      "views": "1.45M views",
      "decoded": {
        "hook": "Diagnosis flip",
        "why": "Reframing \"writer's block\" as \"input block\" gives the reader a lever they didn't know they had — agency replaces frustration.",
        "pattern": "You don't have [the problem they name]. You have [the real problem]. [Simple fix] and [the result] shows up.",
        "apply": "You don't have [the symptom]. You have [the upstream cause]. [Fix the cause] and [the outcome] takes care of itself."
      }
    },
    {
      "id": "i4",
      "cat": "creators",
      "name": "Naval",
      "handle": "@naval · X",
      "text": "Stop optimizing your morning routine. Start optimizing what you do with the next 6 hours.",
      "tag": "6× outlier",
      "views": "510K views",
      "decoded": {
        "hook": "Stop / start reframe",
        "why": "Two parallel imperatives. The first one liberates the reader from a guilt loop, the second points to the real lever.",
        "pattern": "Stop [thing the audience over-invests in]. Start [the thing that compounds].",
        "apply": "Stop [the procrastination dressed as productivity]. Start [the thing that actually moves your number]."
      }
    },
    {
      "id": "i5",
      "cat": "creators",
      "name": "Chris Williamson",
      "handle": "@chriswillx · YT",
      "text": "AI didn't kill writing. Lazy writing did. Here's how to use AI without losing your voice.",
      "tag": "14× outlier",
      "views": "1.8M views",
      "decoded": {
        "hook": "False blame reversal",
        "why": "Disagreeing with the loud crowd buys credibility. The \"here's how\" makes it actionable instead of just a take.",
        "pattern": "[Scapegoat] didn't kill [thing]. [Real cause] did. Here's how to [use scapegoat] without [losing the thing].",
        "apply": "[Tool/trend] didn't kill [skill you care about]. [The real bad habit] did. Here's how to use [tool] without [losing the thing that matters]."
      }
    },
    {
      "id": "i8",
      "cat": "creators",
      "name": "Jay Clouse",
      "handle": "@jayclouse · in",
      "text": "Stop chasing followers. Start chasing the right 100 people. Compound the rest.",
      "tag": "7× outlier",
      "views": "420K views",
      "decoded": {
        "hook": "Stop / start + specific number",
        "why": "Three short imperatives. The \"100\" number is small enough to feel possible and specific enough to feel real.",
        "pattern": "Stop chasing [vanity metric]. Start chasing [the right small number]. [Compound verb] the rest.",
        "apply": "Stop chasing [the vanity metric in your niche]. Start chasing [the right small number]. [Compound action] the rest."
      }
    }
  ];

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const initials = name => name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const signup = () => window.SonaAuth && window.SonaAuth.openSignup();

  let filter = 'all';
  let openId = null;

  function cardHTML(p) {
    return `<div class="shot-card" data-id="${esc(p.id)}">
      <div class="sc-top">
        <span class="sc-av">${esc(initials(p.name))}</span>
        <div><div class="sc-name">${esc(p.name)}</div><div class="sc-handle mono">${esc(p.handle)}</div></div>
        <span class="sc-views mono">${esc(p.views)}</span>
      </div>
      <p class="sc-text">${esc(p.text)}</p>
      <div class="sc-foot">
        <span class="sc-tag mono">${esc(p.tag)}</span>
        <button type="button" class="sc-act" data-act="decode">Decode</button>
        <button type="button" class="sc-act" data-act="save">Save</button>
      </div>
    </div>`;
  }

  function decodeHTML(p) {
    const d = p.decoded;
    return `<div class="shot-decode">
      <button type="button" class="shot-back" data-act="back">← Back to feed</button>
      <div class="sd-quote">
        <div class="sc-top">
          <span class="sc-av">${esc(initials(p.name))}</span>
          <div><div class="sc-name">${esc(p.name)}</div><div class="sc-handle mono">${esc(p.handle)}</div></div>
          <span class="sc-tag mono">${esc(p.tag)}</span>
        </div>
        <p class="sc-text">${esc(p.text)}</p>
      </div>
      <div class="sd-row"><span class="sd-lab mono">Hook</span><p>${esc(d.hook)}</p></div>
      <div class="sd-row"><span class="sd-lab mono">Why it worked</span><p>${esc(d.why)}</p></div>
      <div class="sd-row"><span class="sd-lab mono">Pattern</span><p class="sd-pat mono">${esc(d.pattern)}</p></div>
      <div class="sd-row"><span class="sd-lab mono">Make it yours</span><p class="sd-pat mono">${esc(d.apply)}</p></div>
      <button type="button" class="sd-cta" data-act="use">Use this pattern <span class="btn-arrow">→</span></button>
    </div>`;
  }

  function render() {
    if (openId) {
      const p = POSTS.find(x => x.id === openId);
      if (p) { grid.innerHTML = decodeHTML(p); grid.classList.add('is-decode'); return; }
      openId = null;
    }
    grid.classList.remove('is-decode');
    const list = filter === 'all' ? POSTS : POSTS.filter(p => p.cat === filter);
    grid.innerHTML = list.map(cardHTML).join('');
    if (head) head.textContent = `${filter === 'all' ? 'all niches' : filter} · last 7 days · sorted by outlier`;
  }

  // One delegated listener: the grid is re-rendered constantly, so per-node
  // handlers would have to be rebound on every pass.
  grid.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'back') { openId = null; return render(); }
    if (act === 'use' || act === 'save') return signup();
    if (act === 'decode') {
      const card = btn.closest('.shot-card');
      openId = card && card.dataset.id;
      render();
      panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      filter = chip.textContent.trim().toLowerCase();
      openId = null;
      render();
    });
  });

  // The sidebar previews views that only exist behind an account.
  panel.querySelectorAll('.shot-nav').forEach(nav => {
    if (nav.classList.contains('on')) return;       // Discover is the live one
    nav.addEventListener('click', signup);
  });

  render();
})();
