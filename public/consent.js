/* Analytics consent for the public pages.
 *
 * Google Tag Manager (GTM-PTX2S9C5) is not loaded at all until a visitor
 * clicks Accept. Decline, or no answer, means no Google request and no Google
 * cookie. The choice is kept in localStorage as "sona-consent" and can be
 * changed from the "Cookie settings" link in the footer or on the privacy page.
 *
 * Accepting grants analytics only. Advertising signals stay denied, which
 * matches what the banner says: "No ads". Change both if that ever changes.
 *
 * Not loaded on the sign-in page or inside the app, so nothing in GTM can
 * read an email address or a user's private work.
 */
(function () {
  'use strict';

  var GTM_ID = 'GTM-PTX2S9C5';
  var KEY = 'sona-consent';

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });

  function read() {
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  }
  function write(v) {
    try { localStorage.setItem(KEY, v); } catch (_) {}
  }

  var loaded = false;
  function loadGtm() {
    if (loaded) return;
    loaded = true;
    gtag('consent', 'update', { analytics_storage: 'granted' });
    // Google's standard container loader: the gtm.js event is what starts
    // the container's page-view triggers.
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
    document.head.appendChild(s);
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
      '<p><b>Can we count your visit?</b> With your OK, Google Analytics shows us which pages help. No ads. ' +
      '<a href="/privacy.html#cookies">Privacy</a></p>' +
      '<div class="consent-acts"><button type="button" data-v="denied">Decline</button>' +
      '<button type="button" data-v="granted">Accept</button></div>';
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]');
      if (!b) return;
      var v = b.getAttribute('data-v');
      var was = read();
      write(v);
      close();
      if (v === 'granted') loadGtm();
      // Google's tags can't be unloaded from a running page, so a change from
      // Accept to Decline takes effect on the next page.
      else if (was === 'granted' && loaded) location.reload();
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
  if (choice === 'granted') loadGtm();
  else if (choice !== 'denied') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open);
    else open();
  }
})();
