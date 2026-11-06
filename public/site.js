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
