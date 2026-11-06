/* Sona marketing pages — shared behaviour. Loaded with `defer` on every page
 * that uses site.css. The theme itself is set by the inline bootstrap in each
 * page's <head> (before paint): a saved choice wins, otherwise dark. */

// Sign-in: Sona Auth and Clerk are fetched lazily. Calls made before they
// arrive are queued and replayed, so every Start free / Sign in works at once.
window.SonaAuth = window.SonaAuth || {
  _queue: [],
  openLogin: function () { this._queue.push(['openLogin']); window.loadAuthScripts && window.loadAuthScripts(); },
  openSignup: function () { this._queue.push(['openSignup']); window.loadAuthScripts && window.loadAuthScripts(); },
  openWaitlist: function () { this._queue.push(['openWaitlist']); window.loadAuthScripts && window.loadAuthScripts(); },
  openSettings: function () { this._queue.push(['openSettings']); window.loadAuthScripts && window.loadAuthScripts(); },
  getUser: function () { return null; },
  signOut: function () { this._queue.push(['signOut']); window.loadAuthScripts && window.loadAuthScripts(); }
};
(function () {
  window.loadAuthScripts = function () {
    if (window.__authScriptsLoaded) return;
    window.__authScriptsLoaded = true;
    // Bump these strings whenever auth.js or clerk-auth.js changes.
    // async = false keeps insertion order, so the Clerk layer always runs second.
    ['auth.js?v=20261002a', 'clerk-auth.js?v=20261002a'].forEach(function (src) {
      var s = document.createElement('script');
      s.src = '/' + src; s.async = false;
      document.head.appendChild(s);
    });
  };
  var hasSession = false;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && ((key.indexOf('sb-') === 0 && /-auth-token$/.test(key)) || key.indexOf('clerk') !== -1)) { hasSession = true; break; }
    }
  } catch (e) {}
  if (hasSession) window.loadAuthScripts();
  else window.addEventListener('load', function () {
    if (window.requestIdleCallback) requestIdleCallback(function () { setTimeout(window.loadAuthScripts, 1000); });
    else setTimeout(window.loadAuthScripts, 2000);
  });
})();

// Theme toggle. A choice is saved as sona-theme (the same key /app uses).
(function () {
  var root = document.documentElement;
  var btns = document.querySelectorAll('[data-theme-set]');
  function paint() {
    var cur = root.getAttribute('data-theme');
    btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.themeSet === cur)); });
  }
  btns.forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.dataset.themeSet;
      window.__sonaThemeChosen = true;
      try { localStorage.setItem('sona-theme', t); } catch (e) {}
      root.setAttribute('data-theme', t);
    });
  });
  new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  paint();
})();

// Cursor-lit dot grid, after eden.so. Every <canvas data-dots> draws a 24px
// grid; dots within ~150px of the pointer brighten, grow and lean toward it,
// and the pointer is followed with easing so the light trails slightly. The
// loop runs only while something is moving and the canvas is on screen.
// Touch screens and reduced motion get the still grid.
(function () {
  var canvases = document.querySelectorAll('canvas[data-dots]');
  if (!canvases.length) return;
  var live = matchMedia('(hover: hover) and (pointer: fine)').matches &&
             !matchMedia('(prefers-reduced-motion: reduce)').matches;
  var GAP = 24, R = 150, PULL = 0.18;

  canvases.forEach(function (cv) {
    var ctx = cv.getContext('2d');
    var w = 0, h = 0, cols = 0, rows = 0, ox = 0, oy = 0;
    var mx = 0, my = 0, tx = 0, ty = 0, strength = 0, target = 0;
    var raf = 0, onScreen = true;
    var rgb = '15,23,42', base = 0.11, peak = 0.7;

    function readTheme() {
      var cs = getComputedStyle(cv);
      rgb = cs.getPropertyValue('--dot-rgb').trim() || rgb;
      base = parseFloat(cs.getPropertyValue('--dot-base')) || base;
      peak = parseFloat(cs.getPropertyValue('--dot-peak')) || peak;
    }
    function resize() {
      var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / GAP) + 1; rows = Math.ceil(h / GAP) + 1;
      ox = (w - (cols - 1) * GAP) / 2; oy = GAP / 2;
      draw();
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      var lit = strength > 0.002, near = [];
      // Resting dots in one pass, one fill.
      ctx.fillStyle = 'rgba(' + rgb + ',' + base + ')';
      ctx.beginPath();
      for (var j = 0; j < rows; j++) {
        var y = oy + j * GAP;
        for (var i = 0; i < cols; i++) {
          var x = ox + i * GAP;
          if (lit) {
            var dx = mx - x, dy = my - y;
            if (dx > -R && dx < R && dy > -R && dy < R) {
              var d = Math.sqrt(dx * dx + dy * dy);
              if (d < R) { near.push(x, y, dx, dy, d); continue; }
            }
          }
          ctx.rect(x - 1, y - 1, 2, 2);
        }
      }
      ctx.fill();
      // Dots near the pointer, each with its own light.
      for (var k = 0; k < near.length; k += 5) {
        var f = 1 - near[k + 4] / R;
        f = f * f * (3 - 2 * f) * strength;           // smoothstep falloff
        var s = 2 + f * 1.4;
        var px = near[k] + near[k + 2] * f * PULL, py = near[k + 1] + near[k + 3] * f * PULL;
        ctx.fillStyle = 'rgba(' + rgb + ',' + (base + (peak - base) * f).toFixed(3) + ')';
        ctx.fillRect(px - s / 2, py - s / 2, s, s);
      }
    }
    function tick() {
      raf = 0;
      mx += (tx - mx) * 0.18; my += (ty - my) * 0.18;
      strength += (target - strength) * 0.12;
      draw();
      if (Math.abs(tx - mx) > 0.3 || Math.abs(ty - my) > 0.3 || Math.abs(target - strength) > 0.004) kick();
    }
    function kick() { if (!raf && onScreen) raf = requestAnimationFrame(tick); }

    readTheme();
    new ResizeObserver(resize).observe(cv);
    new MutationObserver(function () { readTheme(); draw(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; if (onScreen) kick(); }).observe(cv);
    if (!live) return;

    window.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      var inside = x > -R && y > -R && x < r.width + R && y < r.height + R;
      if (inside) {
        if (strength < 0.02) { mx = x; my = y; }    // arrive where the pointer is, don't sweep in
        tx = x; ty = y; target = 1;
      } else target = 0;
      kick();
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { target = 0; kick(); });
    window.addEventListener('blur', function () { target = 0; kick(); });
    window.addEventListener('scroll', function () { if (target) { target = 0; kick(); } }, { passive: true });
  });
})();

// Mobile menu: focus stays inside while open, Escape closes, the page behind
// is inert, and same-page links close the sheet before gliding.
(function () {
  var btn = document.querySelector('.menu-btn'), mm = document.getElementById('mobile-menu');
  var nav = document.querySelector('.nav');
  if (!btn || !mm || !nav) return;
  var behind = [document.getElementById('main'), document.querySelector('.site-foot'), document.querySelector('.theme-toggle')];
  function isOpen() { return mm.classList.contains('open'); }
  function setOpen(open, returnFocus) {
    mm.classList.toggle('open', open);
    nav.classList.toggle('menu-open', open);
    document.documentElement.classList.toggle('menu-is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
    behind.forEach(function (el) { if (el) el.inert = open; });
    if (open) { var first = mm.querySelector('a'); if (first) first.focus({ preventScroll: true }); }
    else if (returnFocus !== false) btn.focus({ preventScroll: true });
  }
  btn.addEventListener('click', function () { setOpen(!isOpen()); });
  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    if (e.key !== 'Tab') return;
    var items = [btn].concat(Array.prototype.slice.call(mm.querySelectorAll('a')));
    var i = items.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
    else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
  });
  mm.querySelectorAll('.mm-links a').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var url = new URL(a.href, location.href);
      var samePage = url.pathname === location.pathname && url.hash.length > 1;
      var target = samePage && document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!target) { setOpen(false, false); return; }
      e.preventDefault();
      setOpen(false, false);
      requestAnimationFrame(function () {
        if (window.sonaLenis) window.sonaLenis.scrollTo(target, { offset: -64 });
        else target.scrollIntoView({ behavior: 'smooth' });
        history.pushState(null, '', url.hash);
      });
    });
  });
  mm.querySelectorAll('.mm-actions a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false, false); }); });
  matchMedia('(min-width: 761px)').addEventListener('change', function (m) { if (m.matches && isOpen()) setOpen(false, false); });
})();
