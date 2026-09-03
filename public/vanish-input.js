/* Vanish input — an input whose placeholder cycles, and whose text disperses
 * into particles when you submit it.
 *
 * A hand port of the Aceternity/shadcn "Placeholders and Vanish Input", which
 * ships as a React + TypeScript + Tailwind component using framer-motion. Sona
 * has none of those — no bundler, no build step, no JSX — so installing that
 * stack to get one input would be a large change for a small effect. The canvas
 * work is the interesting part and it is plain DOM anyway.
 *
 * Three substitutions for the React version:
 *   useState / useRef  → closure variables
 *   AnimatePresence    → a CSS transition on the placeholder element
 *   motion.path        → a CSS transition on stroke-dashoffset
 *
 * Usage:
 *   SonaVanishInput.mount(formEl, {
 *     placeholders: ['…', '…'],
 *     onSubmit: (value) => {},
 *     onChange: (value) => {},
 *   });
 */
(function () {
  'use strict';

  var ROTATE_MS = 3000;

  function mount(form, opts) {
    var placeholders = (opts && opts.placeholders) || [];
    var onSubmit = (opts && opts.onSubmit) || function () {};
    var onChange = (opts && opts.onChange) || function () {};

    var input = form.querySelector('input[type="text"]');
    var canvas = form.querySelector('canvas');
    var ghost = form.querySelector('.vi-ghost');
    var button = form.querySelector('button[type="submit"]');
    if (!input || !canvas || !ghost) return null;

    var animating = false;
    var particles = [];
    var idx = 0;
    var timer = null;

    // ─── Rotating placeholder ───

    function showPlaceholder() {
      if (!placeholders.length) return;
      ghost.classList.add('out');
      setTimeout(function () {
        ghost.textContent = placeholders[idx];
        ghost.classList.remove('out');
      }, 180);
    }
    function start() {
      if (timer || placeholders.length < 2) return;
      timer = setInterval(function () {
        idx = (idx + 1) % placeholders.length;
        showPlaceholder();
      }, ROTATE_MS);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }
    // A background tab still fires intervals; without this the placeholder
    // races through the list while nobody is looking and lands somewhere
    // arbitrary when the tab comes back.
    function onVisibility() {
      if (document.visibilityState === 'visible') start(); else stop();
    }

    // ─── Canvas ───
    // The text is drawn once at submit time, read back as pixels, and each
    // opaque pixel becomes a particle. Scaling by devicePixelRatio keeps the
    // particles from looking chunky on a retina screen — the original hardcoded
    // an 800x800 buffer and scaled it down with a CSS transform.

    function sample() {
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = input.getBoundingClientRect();
      var w = Math.max(1, Math.ceil(rect.width));
      var h = Math.max(1, Math.ceil(rect.height));

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      var cs = getComputedStyle(input);
      ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      ctx.fillStyle = cs.color;
      ctx.textBaseline = 'middle';
      ctx.fillText(input.value, parseFloat(cs.paddingLeft) || 0, h / 2);

      var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      var out = [];
      // Step 2 device pixels at a time: sampling every pixel on a retina screen
      // produces four times the particles for no visible gain and a long frame.
      for (var y = 0; y < canvas.height; y += 2) {
        for (var x = 0; x < canvas.width; x += 2) {
          var i = (y * canvas.width + x) * 4;
          // Keyed on alpha, not on all three colour channels being non-zero.
          // The original test dropped any pixel with a zero channel, which
          // silently discarded parts of dark or saturated glyphs.
          if (data[i + 3] > 90) {
            out.push({
              x: x / dpr, y: y / dpr, r: 1,
              c: 'rgba(' + data[i] + ',' + data[i + 1] + ',' + data[i + 2] + ',' + (data[i + 3] / 255) + ')',
            });
          }
        }
      }
      particles = out;
    }

    function finish() {
      particles = [];
      input.value = '';
      animating = false;
      form.classList.remove('vi-animating');
      var ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      syncEmpty();
    }

    function burst() {
      var ctx = canvas.getContext('2d');
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var maxX = particles.reduce(function (m, p) { return p.x > m ? p.x : m; }, 0);
      var pos = maxX;

      // requestAnimationFrame does not fire in a background tab, and some
      // browsers throttle it hard under low power. Without this the loop simply
      // stops mid-flight and leaves the input blanked, disabled and stuck —
      // someone who submits and switches tab comes back to a dead control.
      // The animation is decoration; the input recovering is not optional.
      var bail = setTimeout(function () { if (animating) finish(); }, 2500);

      function frame() {
        pos -= 8;
        var next = [];
        for (var i = 0; i < particles.length; i++) {
          var p = particles[i];
          if (p.x < pos) { next.push(p); continue; }
          if (p.r <= 0) continue;
          p.x += Math.random() > 0.5 ? 1 : -1;
          p.y += Math.random() > 0.5 ? 1 : -1;
          p.r -= 0.05 * Math.random();
          next.push(p);
        }
        particles = next;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (var j = 0; j < particles.length; j++) {
          var q = particles[j];
          if (q.x <= pos) continue;
          ctx.fillStyle = q.c;
          ctx.fillRect(q.x, q.y, q.r, q.r);
        }

        if (particles.length) {
          requestAnimationFrame(frame);
        } else {
          clearTimeout(bail);
          finish();
        }
      }
      requestAnimationFrame(frame);
    }

    function syncEmpty() {
      var has = input.value.trim().length > 0;
      form.classList.toggle('vi-has-value', has);
      if (button) button.disabled = !has;
    }

    function submit() {
      var value = input.value.trim();
      if (!value || animating) return;

      // The reduced-motion path skips the particles entirely rather than
      // playing a shorter version of them — the effect IS the motion.
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        input.value = '';
        syncEmpty();
        onSubmit(value);
        return;
      }

      animating = true;
      form.classList.add('vi-animating');
      sample();
      burst();
      onSubmit(value);   // fires immediately; the animation is decoration
    }

    // ─── Wiring ───

    input.addEventListener('input', function () {
      if (animating) return;
      syncEmpty();
      onChange(input.value);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    document.addEventListener('visibilitychange', onVisibility);

    if (placeholders.length) ghost.textContent = placeholders[0];
    syncEmpty();
    start();

    return {
      destroy: function () {
        stop();
        document.removeEventListener('visibilitychange', onVisibility);
      },
      focus: function () { input.focus(); },
    };
  }

  window.SonaVanishInput = { mount: mount };
})();
