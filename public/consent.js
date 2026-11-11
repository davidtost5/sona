/* Analytics consent for the public pages.
 *
 * Google Tag Manager (GTM-PTX2S9C5) loads on every public page in Consent
 * Mode, from the snippet in each page's <head>, with storage denied by
 * default. Before a choice Google receives only cookieless signals; nothing is
 * stored. Accept grants analytics storage; Decline keeps it denied. Both are
 * remembered in localStorage as "sona-consent" and read back by the head
 * snippet on the next page. "Cookie settings" links reopen the banner.
 *
 * Advertising storage stays denied either way, which is what the banner
 * promises ("No ads").
 *
 * Neither the snippet nor this file is on the sign-in page or in the app.
 */
(function () {
  'use strict';

  var KEY = 'sona-consent';
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  function read() {
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  }
  function write(v) {
    try { localStorage.setItem(KEY, v); } catch (_) {}
  }
  function apply(v) {
    gtag('consent', 'update', { analytics_storage: v === 'granted' ? 'granted' : 'denied' });
    window.dataLayer.push({ event: 'sona_consent', sona_consent: v });
  }

  // ── Banner ──
  var box = null;
  function style() {
    if (document.getElementById('consent-style')) return;
    var st = document.createElement('style');
    st.id = 'consent-style';
    st.textContent =
      '.consent{position:fixed;left:16px;bottom:16px;z-index:90;width:min(380px,calc(100% - 32px));padding:16px 18px;border-radius:14px;' +
      'background:var(--card,#fff);color:var(--ink,#0f172a);box-shadow:0 0 0 1px var(--line-2,#cbd5e1),0 18px 40px -18px rgba(15,23,42,.45);' +
      'font-size:14px;line-height:1.55;animation:consent-in .3s ease-out}' +
      '.consent p{margin:0;color:var(--ink-2,#475569)}.consent p b{color:var(--ink,#0f172a);font-weight:600}' +
      '.consent a{color:var(--ink,#0f172a)}' +
      '.consent-acts{display:flex;gap:8px;margin-top:12px}' +
      '.consent-acts button{flex:1;min-height:40px;border-radius:10px;font:inherit;font-weight:500;cursor:pointer;' +
      'border:0;background:var(--raise,#f1f5f9);color:var(--ink,#0f172a);box-shadow:inset 0 0 0 1px var(--line-2,#cbd5e1)}' +
      '.consent-acts button:hover{background:var(--raise-2,#e2e8f0)}' +
      '@keyframes consent-in{from{opacity:0;transform:translateY(8px)}}' +
      '@media (prefers-reduced-motion:reduce){.consent{animation:none}}';
    document.head.appendChild(st);
  }

  function close() {
    if (box) { box.remove(); box = null; }
  }

  function open() {
    style();
    close();
    box = document.createElement('div');
    box.className = 'consent';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Cookie choice');
    // Static markup; nothing user-supplied goes in here.
    box.innerHTML =
      '<p><b>Can we count your visit?</b> With your OK, Google Analytics sets cookies that show us which pages help. No ads. ' +
      '<a href="/privacy.html#cookies">Privacy</a></p>' +
      '<div class="consent-acts"><button type="button" data-v="denied">Decline</button>' +
      '<button type="button" data-v="granted">Accept</button></div>';
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]');
      if (!b) return;
      var v = b.getAttribute('data-v');
      write(v);
      close();
      apply(v);
    });
    document.body.appendChild(box);
  }

  // "Cookie settings" links anywhere on the page reopen the banner.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-consent-open]');
    if (!a) return;
    e.preventDefault();
    open();
  });

  window.sonaConsent = { open: open };

  var choice = read();
  if (choice !== 'granted' && choice !== 'denied') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open);
    else open();
  }
})();
