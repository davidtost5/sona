/* Sona — smooth scrolling (Lenis 1.2.3, served from /vendor).
 *
 * Load after vendor/lenis-1.2.3.min.js on marketing pages. Not used in /app,
 * whose panes scroll on their own.
 *
 * Lenis drives the page's real scroll position, so IntersectionObserver
 * reveals and position: sticky keep working. What it would otherwise break,
 * and how each is handled:
 *
 *   - Reduced motion: never started.
 *   - Touch: left native (syncTouch off), which is what phones expect.
 *   - CSS `scroll-behavior: smooth` on <html> fights Lenis; turned off while
 *     Lenis runs (`html.lenis`).
 *   - "#pricing" links: glided to by the click handler below. Lenis 1.2.3's
 *     own `anchors` option never cancels the browser's jump, so the page
 *     teleported first and there was nothing left to glide.
 *   - Anything scrollable inside the page — a docs sidebar, a modal, the Clerk
 *     sign-in, the age check — keeps native wheel scrolling (`prevent`). This
 *     Lenis version has no automatic nested-scroll detection.
 *   - Scroll locks: the loader (`html.sona-loading`) and menus or modals that
 *     set `body.style.overflow = 'hidden'` pause Lenis, which would otherwise
 *     scroll the page behind them.
 *   - GSAP on the page: Lenis runs on GSAP's ticker so both share one frame
 *     loop; otherwise it runs its own.
 */
(function () {
  'use strict';

  if (typeof window.Lenis !== 'function') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var root = document.documentElement;

  var style = document.createElement('style');
  style.textContent = 'html.lenis{scroll-behavior:auto !important;}';
  document.head.appendChild(style);

  // True when the wheel is over something that can scroll on its own.
  function insideScrollable(node) {
    for (var el = node; el && el !== document.body && el !== root; el = el.parentElement) {
      if (el.nodeType !== 1) continue;
      if (el.tagName === 'DIALOG' || el.hasAttribute('data-lenis-prevent')) return true;
      if (el.scrollHeight > el.clientHeight) {
        var oy = getComputedStyle(el).overflowY;
        if (oy === 'auto' || oy === 'scroll') return true;
      }
    }
    return false;
  }

  var useGsap = typeof window.gsap !== 'undefined';
  var lenis = new window.Lenis({
    autoRaf: !useGsap,
    prevent: insideScrollable,
  });
  window.sonaLenis = lenis;

  // Same-page "#section" links glide instead of jumping. Captured before
  // anything else, and the hash still lands in the address bar.
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href*="#"]');
    if (!a || a.target === '_blank') return;
    var url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash.length < 2) return;
    var el = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!el || lenis.isStopped) return;
    e.preventDefault();
    var margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    lenis.scrollTo(el, { offset: -margin });
    if (location.hash !== url.hash) history.pushState(null, '', url.hash);
  }, true);

  if (useGsap) {
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  function locked() {
    return root.classList.contains('sona-loading') || document.body.style.overflow === 'hidden';
  }
  function sync() {
    if (locked()) lenis.stop(); else lenis.start();
  }
  var mo = new MutationObserver(sync);
  mo.observe(root, { attributes: true, attributeFilter: ['class'] });
  mo.observe(document.body, { attributes: true, attributeFilter: ['style'] });
  sync();
})();
