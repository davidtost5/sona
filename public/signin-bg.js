// Animated sign-in backdrop.
//
// Three layers, cheapest first: two slow green blooms, a drifting starfield,
// and film grain (CSS, not here). Everything is deliberately low-contrast —
// the point is atmosphere you notice only when you stop looking at the form.
//
// Standalone and dependency-free so any page can use it: give the page a
// <canvas id="bg"> and include this file.

(function () {
  const canvas = document.getElementById('bg');
  if (!canvas || !canvas.getContext) return;          // no canvas support, no backdrop
  const ctx = canvas.getContext('2d');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Sona green, as RGB triplets so we can vary alpha per draw.
  const GREEN = '95, 184, 150';
  const DEEP = '40, 119, 92';

  let w = 0, h = 0, dpr = 1, stars = [], raf = null, t = 0;

  function seed() {
    // Density scales with area so a wide monitor doesn't look empty and a
    // phone doesn't look like static.
    const count = Math.round(Math.min(140, Math.max(36, (w * h) / 14000)));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.1 + 0.35,
      // Most stars are near-white; a few pick up the brand green.
      green: Math.random() < 0.22,
      base: Math.random() * 0.4 + 0.12,
      phase: Math.random() * Math.PI * 2,
      twinkle: Math.random() * 0.6 + 0.25,
      vx: (Math.random() - 0.5) * 0.045,
      vy: -(Math.random() * 0.05 + 0.012),          // a slow, steady upward drift
    }));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);   // cap: 3x costs a lot, shows little
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    // Always paint once synchronously. rAF doesn't run while the tab is hidden,
    // so without this a page opened in a background tab shows a blank canvas
    // until it's focused. Also covers reduced-motion, which never starts a loop.
    draw(t);
  }

  function bloom(cx, cy, radius, rgb, alpha) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  function draw(time) {
    ctx.clearRect(0, 0, w, h);

    // Two blooms on slow, mismatched orbits (7:1 and 11:1 periods) so the
    // background never visibly repeats.
    const span = Math.max(w, h);
    bloom(
      w * 0.5 + Math.sin(time / 11000) * w * 0.10,
      h * 0.42 + Math.cos(time / 9000) * h * 0.06,
      span * 0.55, DEEP, 0.20
    );
    bloom(
      w * 0.28 + Math.cos(time / 17000) * w * 0.14,
      h * 0.72 + Math.sin(time / 13000) * h * 0.08,
      span * 0.34, GREEN, 0.055
    );

    for (const s of stars) {
      // Sine twinkle, clamped so a star never fully vanishes.
      const a = Math.max(0.03, s.base + Math.sin(time / 1000 * s.twinkle + s.phase) * s.base * 0.7);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.green ? `rgba(${GREEN}, ${a})` : `rgba(228, 235, 232, ${a})`;
      ctx.fill();

      s.x += s.vx;
      s.y += s.vy;
      // Wrap rather than respawn: keeps density constant with no popping.
      if (s.y < -2) { s.y = h + 2; s.x = Math.random() * w; }
      if (s.x < -2) s.x = w + 2;
      if (s.x > w + 2) s.x = 0;
    }
  }

  function frame(time) {
    t = time;
    draw(time);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf || reduced.matches) return;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  resize();
  window.addEventListener('resize', resize);

  // Don't burn cycles animating a backdrop nobody is looking at.
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduced.addEventListener('change', () => { stop(); reduced.matches ? draw(t) : start(); });

  start();

  // Exposed so a page (or a test) can drive frames deterministically.
  window.__sonaBg = { draw, start, stop, count: () => stars.length };
})();
