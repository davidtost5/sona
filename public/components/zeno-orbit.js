/* Zeno's orbit — Zeno's own animated mark.
 *
 * A sphere of dots turning slowly, lit by depth, in one warm orange range
 * (amber to coral) rather than a rainbow. It leans toward the pointer, swells
 * and brightens with the voice while listening, and spins up while thinking.
 * Hues can be tuned on the canvas with --orbit-hue-from / --orbit-hue-to.
 *
 *   var orbit = SonaOrbit.create(canvas);
 *   orbit.setMode('idle' | 'listening' | 'thinking');
 *   orbit.setLevel(0..1);        // voice level while listening
 *
 * Animates only while on screen; one still frame with reduced motion.
 */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var TAU = Math.PI * 2;
  var GOLD = Math.PI * (3 - Math.sqrt(5));

  function sphere(n) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = GOLD * i;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    return pts;
  }

  function create(cv, opts) {
    opts = opts || {};
    var ctx = cv.getContext('2d');
    var pts = null, size = 0, raf = 0, visible = true, last = 0;
    var mode = 'idle', level = 0, shown = 0;
    var rotY = 0.4, rotX = -0.38, speed = 0.00035, tiltX = 0, tiltY = 0, aimX = 0, aimY = 0;
    var hueFrom = 18, hueTo = 42, dark = false;

    function readTheme() {
      var cs = getComputedStyle(cv);
      var a = parseFloat(cs.getPropertyValue('--orbit-hue-from')), b = parseFloat(cs.getPropertyValue('--orbit-hue-to'));
      if (Number.isFinite(a)) hueFrom = a;
      if (Number.isFinite(b)) hueTo = b;
      dark = document.documentElement.getAttribute('data-theme') === 'dark';
    }
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = cv.clientWidth || 76;
      cv.width = cv.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Fewer dots on a small mark so each one still reads.
      pts = sphere(opts.dots || Math.round(Math.max(260, Math.min(900, size * 7))));
      draw();
    }

    function draw() {
      if (!size || !pts) return;
      var c = size / 2, lv = shown;
      var R = size * 0.43 * (1 + lv * 0.08);
      var ay = rotY + tiltY, ax = rotX + tiltX;
      var cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
      var dotScale = Math.max(size / 120, 0.5) * (size < 120 ? 1.15 : 1);
      ctx.clearRect(0, 0, size, size);
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
        var y2 = p[1] * cx - z1 * sx, z2 = p[1] * sx + z1 * cx;
        if (z2 < -0.2) continue;                     // the far side stays dark
        var depth = (z2 + 1) / 2;                      // 0 back … 1 front
        // Warm range: amber at the top, coral toward the bottom, shifted a
        // little around the sphere so it reads as turning.
        var mix = (p[1] + 1) / 2 * 0.7 + (Math.atan2(p[2], p[0]) / TAU + 0.5) * 0.3;
        var hue = hueTo - (hueTo - hueFrom) * mix;
        var light = dark ? 50 + depth * 12 + lv * 6 : 47 + depth * 8 + lv * 4;
        var alpha = (0.22 + depth * 0.78) * (0.85 + lv * 0.15);
        ctx.fillStyle = 'hsla(' + hue.toFixed(0) + ',92%,' + light.toFixed(0) + '%,' + alpha.toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(c + x1 * R, c + y2 * R, (0.55 + depth * 1.45) * dotScale * (1 + lv * 0.25), 0, TAU);
        ctx.fill();
      }
    }

    function frame(now) {
      raf = 0;
      var dt = last ? Math.min(64, now - last) : 16;
      last = now;
      var target = mode === 'thinking' ? 0.0032 : mode === 'listening' ? 0.0011 + shown * 0.0012 : 0.00035;
      speed += (target - speed) * 0.05;
      rotY += speed * dt;                             // accumulated: no jumps when speed changes
      shown += (level - shown) * (level > shown ? 0.35 : 0.1);
      tiltX += (aimX - tiltX) * 0.06; tiltY += (aimY - tiltY) * 0.06;
      draw();
      if (visible && !reduce.matches) raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && visible && !reduce.matches) { last = 0; raf = requestAnimationFrame(frame); } }

    readTheme();
    new ResizeObserver(resize).observe(cv);
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) start(); }).observe(cv);
    new MutationObserver(function () { readTheme(); draw(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (!reduce.matches && matchMedia('(hover: hover)').matches) {
      window.addEventListener('pointermove', function (e) {
        if (!visible) return;
        var r = cv.getBoundingClientRect();
        aimY = Math.max(-0.5, Math.min(0.5, (e.clientX - (r.left + r.width / 2)) / window.innerWidth * 1.4));
        aimX = Math.max(-0.4, Math.min(0.4, -(e.clientY - (r.top + r.height / 2)) / window.innerHeight * 1.2));
      }, { passive: true });
    }
    resize();
    start();

    return {
      setMode: function (m) { mode = m; if (reduce.matches) { shown = m === 'listening' ? 0.5 : 0; draw(); } start(); },
      setLevel: function (v) { level = Math.max(0, Math.min(1, v)); if (!reduce.matches) start(); }
    };
  }

  window.SonaOrbit = { create: create };
})();
