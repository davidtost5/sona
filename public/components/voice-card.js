/* Voice Assistant Card — vanilla port of the transitions.dev Community
 * component (studio.html?id=c85AR0dBjUE). Same state machine, timings and
 * level curve as the React original; the glow replaces voice-glow's
 * <VoiceBeam> with CSS layers fed one smoothed --vb-level per frame.
 *
 * The voice button is Zeno's orbit (zeno-orbit.js), Zeno's own mark.
 *
 * Usage: <div data-voice-card></div> plus voice-card.css, zeno-orbit.js and
 * this file.
 * Tapping the button plays a scripted demo; it does not use the microphone.
 */
(function () {
  'use strict';

  var WORDS = "Find posts about pricing that beat their creator's usual this month".split(' ');
  var WORD_MS = 280;
  var STRENGTH = 0.6;
  var CAPTIONS = { idle: 'Tap to call Zeno', listening: 'Listening…', thinking: 'One moment' };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');

  function cssMs(el, name, fb) {
    var v = parseFloat(getComputedStyle(el).getPropertyValue(name));
    return Number.isFinite(v) ? v : fb;
  }

  // Caption swap: exit up with blur, then enter from below (no transition on
  // the enter start frame), exactly as the React SwapText does.
  function makeSwap(el, card) {
    var shown = el.textContent, timer = 0;
    return function (value) {
      if (value === shown) return;
      clearTimeout(timer);
      el.classList.remove('is-enter-start');
      el.classList.add('is-exit');
      timer = setTimeout(function () {
        shown = value;
        el.textContent = value;
        el.classList.remove('is-exit');
        el.classList.add('is-enter-start');
        void el.offsetHeight;
        el.classList.remove('is-enter-start');
      }, cssMs(card, '--text-swap-dur', 150));
    };
  }

  function mount(host) {
    host.innerHTML =
      '<div class="va-card">' +
        '<div class="va-beam">' +
          '<div class="vb" aria-hidden="true"><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i></div>' +
          '<div class="va-inner"><div class="va-content">' +
            '<header class="va-top">' +
              '<span class="va-av" role="img" aria-label="Zeno"><canvas class="va-av-orbit" width="52" height="52" aria-hidden="true"></canvas></span>' +
              '<div class="va-top-text"><span class="va-name">Zeno</span><span class="va-meta">Call preview</span></div>' +
            '</header>' +
            '<div class="va-divider" aria-hidden="true"></div>' +
            '<div class="va-body">' +
              '<div class="va-bubble-row"><p class="va-bubble"><span>What should we look into?</span></p></div>' +
              '<p class="va-transcript" aria-live="polite"></p>' +
            '</div>' +
            '<div class="va-bottom">' +
              '<span class="va-caption"><span class="t-text-swap" aria-live="polite">' + CAPTIONS.idle + '</span></span>' +
              '<button type="button" class="va-mic" aria-label="Call Zeno" aria-pressed="false">' +
                '<canvas class="va-orbit" width="144" height="144" aria-hidden="true"></canvas>' +
              '</button>' +
            '</div>' +
          '</div></div>' +
        '</div>' +
      '</div>';

    var card = host.querySelector('.va-card');
    var beam = host.querySelector('.vb');
    var transcript = host.querySelector('.va-transcript');
    var mic = host.querySelector('.va-mic');
    var swap = makeSwap(host.querySelector('.t-text-swap'), card);
    var orbit = window.SonaOrbit ? window.SonaOrbit.create(host.querySelector('.va-orbit')) : { setMode: function () {}, setLevel: function () {} };
    // Zeno's logo: the same orbit, small, in a tile. It stays at its resting pace.
    if (window.SonaOrbit) window.SonaOrbit.create(host.querySelector('.va-av-orbit'), { dots: 90, follow: false });

    var phase = 'idle', speaking = false, timers = [];
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

    function setPhase(p) {
      phase = p;
      swap(CAPTIONS[p]);
      var live = p === 'listening';
      mic.classList.toggle('is-live', live);
      mic.setAttribute('aria-pressed', String(live));
      mic.setAttribute('aria-label', live ? 'Hang up' : 'Call Zeno');
      beam.classList.toggle('is-processing', p === 'thinking');
      orbit.setMode(p);
      kick();
    }
    function setCount(n) {
      var ws = transcript.querySelectorAll('.t-stream-w');
      for (var i = 0; i < ws.length; i++) ws[i].classList.toggle('is-in', i < n);
    }
    function renderWords() {
      transcript.innerHTML = '';
      WORDS.forEach(function (w, i) {
        var s = document.createElement('span');
        s.className = 't-stream-w';
        s.textContent = w;
        transcript.appendChild(s);
        if (i < WORDS.length - 1) transcript.appendChild(document.createTextNode(' '));
      });
    }

    function think() {
      speaking = false;
      setPhase('thinking');
      later(function () { setPhase('idle'); }, 1800);
    }
    function start() {
      clearTimers();
      renderWords();           // a fresh run, like React's key={runKey}
      setCount(0);
      speaking = true;
      setPhase('listening');
      WORDS.forEach(function (_, i) { later(function () { setCount(i + 1); }, 400 + i * WORD_MS); });
      later(think, 400 + WORDS.length * WORD_MS + 500);
    }
    mic.addEventListener('click', function () {
      if (phase === 'listening') { clearTimers(); setCount(WORDS.length); think(); }
      else start();
    });
    // Keyboard presses get the same pressed state a pointer does.
    mic.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') mic.classList.add('is-pressed'); });
    mic.addEventListener('keyup', function () { mic.classList.remove('is-pressed'); });
    mic.addEventListener('blur', function () { mic.classList.remove('is-pressed'); });

    // The level curve from the original, smoothed the way a meter is:
    // quick to rise, slower to fall.
    function level() {
      if (!speaking) return 0.06;
      if (reduce.matches) return 0.6 * STRENGTH;
      var t = Date.now();
      var v = 0.55 + Math.sin(t / 150) * 0.22 + Math.sin(t / 61) * 0.12 + Math.sin(t / 37) * 0.08;
      return Math.max(0.06, Math.min(1, v)) * STRENGTH;
    }
    var cur = 0.06, raf = 0;
    function frame() {
      raf = 0;
      var target = level();
      var k = target > cur ? 0.35 : 0.08;
      cur = reduce.matches ? target : cur + (target - cur) * k;
      beam.style.setProperty('--vb-level', cur.toFixed(3));
      orbit.setLevel((cur - 0.06) / (STRENGTH - 0.06));
      if (speaking || Math.abs(target - cur) > 0.002) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }
    beam.style.setProperty('--vb-level', String(cur));

    return {
      destroy: function () { clearTimers(); if (raf) cancelAnimationFrame(raf); host.innerHTML = ''; }
    };
  }

  window.SonaVoiceCard = { mount: mount };
  function auto() { document.querySelectorAll('[data-voice-card]').forEach(mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
