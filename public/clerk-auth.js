/* Sona — Clerk authentication.
 *
 * Drop-in replacement for auth.js. Keeps the same `window.SonaAuth` surface the
 * rest of the site already calls (openLogin / openSignup / openWaitlist /
 * signOut), so index.html, app.html and resources.html need no changes beyond
 * swapping the script tag.
 *
 * ── How this stays compatible with the database ──
 * Supabase is still the database, and row-level security is still the only thing
 * protecting user rows — the browser talks to Postgres directly with the anon
 * key. What changes is who mints the JWT that RLS reads.
 *
 * Clerk issues the session token; Supabase is configured to trust Clerk as a
 * third-party auth provider, so `auth.jwt()->>'sub'` inside a policy returns the
 * Clerk user id. That id is a string like `user_2abc…`, NOT a uuid, which is why
 * migration-clerk-auth.sql retypes every user_id column and rewrites all 20
 * policies. Run that migration before this file ships, or every authenticated
 * read returns zero rows.
 *
 * Note the publishable key is fetched from /api/auth-config rather than
 * hardcoded. Publishable keys are safe in client code by design — that is what
 * they are for — but sourcing it from the environment keeps the dev instance out
 * of the production bundle. The secret key is never referenced here and must
 * never appear in any file under public/.
 */
(function () {
  'use strict';

  var CLERK_JS_VERSION = '5';

  var clerkReady = null;     // Promise<Clerk>, resolved once Clerk.load() returns
  var supabaseClient = null; // Supabase client bound to Clerk's token
  var config = null;         // { url, anonKey, clerkPublishableKey, ... }

  // ─── Config ───

  async function loadConfig() {
    if (config) return config;
    try {
      var res = await fetch('/api/auth-config', { cache: 'no-store' });
      if (!res.ok) throw new Error('auth-config returned ' + res.status);
      // Only cache a successful response. Caching the failure would pin the page
      // into "no auth configured" for its whole lifetime after one flaky
      // request, which reads to the user as a dead login button.
      config = await res.json();
      return config;
    } catch (e) {
      console.warn('[auth] could not load auth config, will retry', e);
      return { configured: false };
    }
  }

  // ─── Clerk ───

  function loadClerkScript(publishableKey, frontendApi) {
    return new Promise(function (resolve, reject) {
      if (window.Clerk) return resolve(window.Clerk);

      var script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.setAttribute('data-clerk-publishable-key', publishableKey);
      // Clerk serves clerk-js from the instance's own frontend API host, which is
      // derived from the publishable key. Letting the key drive it means dev and
      // production instances both work without a second env var.
      script.src = 'https://' + frontendApi + '/npm/@clerk/clerk-js@' + CLERK_JS_VERSION + '/dist/clerk.browser.js';
      script.onload = function () { resolve(window.Clerk); };
      script.onerror = function () { reject(new Error('Clerk failed to load')); };
      document.head.appendChild(script);
    });
  }

  // The publishable key encodes the frontend API host: pk_test_<base64(host$)>.
  function frontendApiFromKey(publishableKey) {
    try {
      var body = publishableKey.replace(/^pk_(test|live)_/, '');
      var decoded = atob(body);
      return decoded.replace(/\$$/, '');
    } catch (e) {
      return null;
    }
  }

  function ensureClerk() {
    if (clerkReady) return clerkReady;

    clerkReady = (async function () {
      // Note: on any failure this promise is un-cached below, so a later click
      // retries rather than inheriting a permanently rejected promise.
      var cfg = await loadConfig();
      var pk = cfg.clerkPublishableKey;
      if (!pk) throw new Error('Clerk is not configured — CLERK_PUBLISHABLE_KEY is unset.');

      var host = frontendApiFromKey(pk);
      if (!host) throw new Error('Could not read the Clerk frontend API from the publishable key.');

      await loadClerkScript(pk, host);
      await window.Clerk.load({
        localization: {
          formFieldInputPlaceholder__emailAddress: 'you@email.com',
          formButtonPrimary: 'Continue',
        },
      });
      return window.Clerk;
    })();

    // A blocked CDN, an offline user or a bad key would otherwise leave a
    // rejected promise cached forever — every later click would fail instantly
    // with no retry, and the first await would surface as an unhandled
    // rejection. Clear it so the next call starts fresh.
    clerkReady.catch(function () { clerkReady = null; });

    return clerkReady;
  }

  // ─── Appearance ───
  // Matches the site: Sona green accent, inherited type, pills only on the
  // primary button. Reads the live theme so the modal doesn't arrive in the
  // wrong palette.

  function appearance() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      variables: {
        colorPrimary: dark ? '#5fb896' : '#28775c',
        colorBackground: dark ? '#1a1d1b' : '#fcfcfa',
        colorText: dark ? '#f3f3f0' : '#1a1a1a',
        colorTextSecondary: dark ? '#a8a8a1' : '#55554f',
        colorInputBackground: 'transparent',
        colorInputText: dark ? '#f3f3f0' : '#1a1a1a',
        // Card radius, NOT pill radius. Clerk applies this variable to every
        // rounded element including the modal card, so the 100px this used to
        // carry rounded a 640px-wide card into an oval and clipped the form
        // inside it. Pills are applied per-element below, where they belong.
        borderRadius: '12px',
        fontFamily: 'inherit',
      },
      elements: {
        card: {
          boxShadow: 'none',
          borderRadius: '16px',
          border: '1px solid ' + (dark ? 'rgba(255,255,255,.12)' : 'rgba(26,26,26,.12)'),
        },
        formButtonPrimary: { borderRadius: '999px' },
        formFieldInput: { borderRadius: '10px' },
        footerAction: { display: 'none' },
      },
    };
  }

  // ─── Age gate ───
  // Sona is 16+ (the EU default age of digital consent; also clears COPPA's 13).
  // Asked once per browser before the Clerk modal opens, for sign-in as well as
  // sign-up, because "Continue with Google" on the sign-in form creates accounts
  // too. The answer is remembered so returning users see it once per device.

  var AGE_KEY = 'sona_age_16_confirmed';
  var ageConfirmed = false;

  function ageAlreadyConfirmed() {
    if (ageConfirmed) return true;
    try { ageConfirmed = window.localStorage.getItem(AGE_KEY) === '1'; } catch (_) {}
    return ageConfirmed;
  }

  // Resolves true once the person ticks the box, false if they back out.
  function confirmAge() {
    if (ageAlreadyConfirmed()) return Promise.resolve(true);

    return new Promise(function (resolve) {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      var c = {
        bg: dark ? '#1a1d1b' : '#fcfcfa',
        text: dark ? '#f3f3f0' : '#1a1a1a',
        mid: dark ? '#a8a8a1' : '#55554f',
        accent: dark ? '#5fb896' : '#28775c',
        onAccent: dark ? '#111312' : '#ffffff',
        border: dark ? 'rgba(255,255,255,.12)' : 'rgba(26,26,26,.12)',
      };

      // The site's reset zeroes margins, which is what centres a modal dialog,
      // and ::backdrop can only be styled from a stylesheet.
      if (!document.getElementById('sona-age-style')) {
        var st = document.createElement('style');
        st.id = 'sona-age-style';
        st.textContent = 'dialog.sona-age{margin:auto;}dialog.sona-age::backdrop{background:rgba(0,0,0,.5);}';
        document.head.appendChild(st);
      }

      var dlg = document.createElement('dialog');
      dlg.className = 'sona-age';
      dlg.setAttribute('aria-labelledby', 'sona-age-title');
      dlg.style.cssText = 'max-width:400px;width:calc(100% - 32px);padding:28px;border-radius:16px;' +
        'border:1px solid ' + c.border + ';background:' + c.bg + ';color:' + c.text + ';' +
        'font-family:inherit;box-sizing:border-box;';
      // Static markup only; nothing user-supplied is interpolated.
      dlg.innerHTML =
        '<h2 id="sona-age-title" style="margin:0 0 10px;font-size:19px;font-weight:600;">Before you continue</h2>' +
        '<p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:' + c.mid + ';">' +
          'Sona is for people aged 16 and over. Paid plans also need you to be 18, ' +
          'or to have a parent or guardian\'s permission.</p>' +
        '<label style="display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.5;cursor:pointer;">' +
          '<input type="checkbox" style="margin-top:3px;width:16px;height:16px;accent-color:' + c.accent + ';flex:none;">' +
          '<span>I\'m 16 or older, and I agree to the <a href="/terms.html" target="_blank" rel="noopener" style="color:inherit;">Terms</a> ' +
          'and <a href="/privacy.html" target="_blank" rel="noopener" style="color:inherit;">Privacy Policy</a>.</span>' +
        '</label>' +
        '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:24px;">' +
          '<button type="button" data-act="cancel" style="padding:9px 16px;border-radius:999px;border:1px solid ' + c.border + ';' +
            'background:transparent;color:' + c.text + ';font:inherit;font-size:14px;cursor:pointer;">Cancel</button>' +
          '<button type="button" data-act="ok" disabled style="padding:9px 18px;border-radius:999px;border:none;' +
            'background:' + c.accent + ';color:' + c.onAccent + ';font:inherit;font-size:14px;font-weight:600;cursor:pointer;opacity:.45;">Continue</button>' +
        '</div>';

      var box = dlg.querySelector('input');
      var ok = dlg.querySelector('[data-act="ok"]');
      box.addEventListener('change', function () {
        ok.disabled = !box.checked;
        ok.style.opacity = box.checked ? '1' : '.45';
      });

      var settled = false;
      function finish(result) {
        if (settled) return;
        settled = true;
        if (result) {
          ageConfirmed = true;
          try { window.localStorage.setItem(AGE_KEY, '1'); } catch (_) {}
        }
        if (dlg.open) dlg.close();
        dlg.remove();
        resolve(result);
      }
      ok.addEventListener('click', function () { if (box.checked) finish(true); });
      dlg.querySelector('[data-act="cancel"]').addEventListener('click', function () { finish(false); });
      dlg.addEventListener('close', function () { finish(false); }); // Esc

      document.body.appendChild(dlg);
      dlg.showModal();
      box.focus();
    });
  }

  // ─── Supabase, authenticated as the Clerk user ───

  async function getSupabase() {
    if (supabaseClient) return supabaseClient;

    var cfg = await loadConfig();
    if (!cfg.configured) return null;
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      console.warn('[auth] supabase-js has not loaded');
      return null;
    }

    // `accessToken` makes every PostgREST request carry Clerk's JWT. Supabase's
    // own auth methods (signIn/signUp/getSession) must NOT be used alongside it —
    // the two session sources conflict. Ask Clerk for the user instead.
    supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey, {
      accessToken: async function () {
        var clerk = await ensureClerk();
        if (!clerk.session) return null;
        return await clerk.session.getToken();
      },
    });

    window.sonaSupabase = supabaseClient;
    return supabaseClient;
  }

  // ─── Public API ───

  async function openSignIn(afterUrl) {
    if (!(await confirmAge())) return;
    var clerk = await ensureClerk();
    clerk.openSignIn({
      appearance: appearance(),
      afterSignInUrl: afterUrl || '/app',
      afterSignUpUrl: afterUrl || '/app',
    });
  }

  async function openSignUp(afterUrl) {
    if (!(await confirmAge())) return;
    var clerk = await ensureClerk();
    clerk.openSignUp({
      appearance: appearance(),
      afterSignInUrl: afterUrl || '/app',
      afterSignUpUrl: afterUrl || '/app',
    });
  }

  async function signOut() {
    var clerk = await ensureClerk();
    await clerk.signOut();
    window.location.href = '/';
  }

  async function getUser() {
    var clerk = await ensureClerk();
    if (!clerk.user) return null;
    var email = clerk.user.primaryEmailAddress;
    return {
      id: clerk.user.id,
      email: email ? email.emailAddress : null,
      name: clerk.user.fullName || clerk.user.firstName || null,
    };
  }

  // Redirects to the marketing site when signed out. Returns the user when in.
  async function requireUser(redirectTo) {
    var clerk = await ensureClerk();
    if (!clerk.user) {
      window.location.href = redirectTo || '/?signin=1';
      return null;
    }
    return await getUser();
  }

  // Swaps the nav between signed-out and signed-in.
  //
  // This deliberately drives `.nav-right` and `.mobile-menu-cta`, the same hooks
  // auth.js uses, rather than a data-auth convention — the site has no
  // data-auth attributes anywhere, so an attribute-based version would leave a
  // signed-in person still looking at a "Sign in" button.
  function paint(user) {
    document.querySelectorAll('.nav-right').forEach(function (navRight) {
      if (!navRight.dataset.loggedOutHtml) {
        navRight.dataset.loggedOutHtml = navRight.innerHTML;
      }

      if (!user) {
        if (navRight.dataset.loggedOutHtml) {
          navRight.innerHTML = navRight.dataset.loggedOutHtml;
        }
        return;
      }

      var initials = (user.name || user.email || 'U')
        .split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();

      // Markup is static; the two account-derived values are set with
      // textContent below. Interpolating a name or email into an innerHTML sink
      // would let profile data be parsed as markup.
      navRight.innerHTML =
        '<div class="user-menu">' +
          '<div class="user-avatar"></div>' +
          '<div class="user-dropdown" id="user-dropdown">' +
            '<div class="user-dropdown-email"></div>' +
            '<button class="user-dropdown-item" id="auth-dashboard" type="button">Dashboard</button>' +
            '<button class="user-dropdown-item" id="auth-account" type="button">Account</button>' +
            '<a class="user-dropdown-item" href="/api/billing-portal" target="_blank" rel="noopener">Manage billing</a>' +
            '<button class="user-dropdown-item danger" id="auth-signout" type="button">Sign out</button>' +
          '</div>' +
        '</div>';
      navRight.querySelector('.user-avatar').textContent = initials;
      navRight.querySelector('.user-dropdown-email').textContent = user.email || '';

      var dropdown = navRight.querySelector('.user-dropdown');
      navRight.querySelector('.user-menu').addEventListener('click', function (e) {
        e.stopPropagation();
        dropdown.classList.toggle('open');
      });
      document.addEventListener('click', function () { dropdown.classList.remove('open'); });

      navRight.querySelector('#auth-dashboard').addEventListener('click', function (e) {
        e.stopPropagation();
        window.location.href = '/app';
      });
      // Clerk's own profile UI replaces the settings modal auth.js opened.
      navRight.querySelector('#auth-account').addEventListener('click', async function (e) {
        e.stopPropagation();
        dropdown.classList.remove('open');
        var clerk = await ensureClerk();
        clerk.openUserProfile({ appearance: appearance() });
      });
      navRight.querySelector('#auth-signout').addEventListener('click', function (e) {
        e.stopPropagation();
        signOut();
      });
    });

    document.querySelectorAll('.mobile-menu-cta').forEach(function (cta) {
      if (user) {
        cta.textContent = 'Dashboard';
        cta.onclick = function (e) { e.preventDefault(); window.location.href = '/app'; };
      } else {
        cta.textContent = 'Log in';
        cta.onclick = function (e) { e.preventDefault(); openSignIn(); };
      }
    });
  }

  // The waitlist is not authentication — it posts to /api/waitlist. auth.js owns
  // a proper modal for it, and that modal is still loaded under Clerk, so hand
  // straight over rather than substituting a worse scroll-to-form. The fallback
  // only matters if auth.js is ever removed entirely.
  function openWaitlist() {
    if (previous && typeof previous.openWaitlist === 'function') {
      return previous.openWaitlist();
    }
    var form = document.getElementById('sub-form');
    if (form) {
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var input = document.getElementById('sub-email');
      if (input) input.focus();
      return;
    }
    window.location.href = '/#pricing';
  }

  // Clerk's own profile UI stands in for auth.js's settings modal.
  async function openSettings() {
    var clerk = await ensureClerk();
    clerk.openUserProfile({ appearance: appearance() });
  }

  // This file may sit alongside auth.js (the Supabase magic-link implementation)
  // during the cutover. It claims window.SonaAuth immediately so the inline
  // onclick handlers on the marketing site bind to something — but when
  // CLERK_PUBLISHABLE_KEY is unset it hands each call straight back to the
  // previous implementation. That keeps this branch deployable before the Clerk
  // environment exists, instead of silently killing every login button.
  var previous = window.SonaAuth || null;

  async function clerkConfigured() {
    var cfg = await loadConfig();
    return Boolean(cfg.clerkPublishableKey);
  }

  // Entry points that can create an account, and so must pass the age gate
  // under either provider.
  var GATED = ['openLogin', 'openSignup', 'openMagic'];

  // Runs `clerkFn` under Clerk, or the same-named method on the old
  // implementation when Clerk is not configured.
  function route(name, clerkFn) {
    return async function () {
      if (await clerkConfigured()) return clerkFn.apply(null, arguments);
      if (GATED.indexOf(name) !== -1 && !(await confirmAge())) return null;
      if (previous && typeof previous[name] === 'function') {
        return previous[name].apply(previous, arguments);
      }
      console.warn('[auth] no auth provider configured for ' + name);
      return null;
    };
  }

  window.SonaAuth = {
    openLogin:  route('openLogin',  function () { return openSignIn(); }),
    openSignup: route('openSignup', function () { return openSignUp(); }),
    openMagic:  route('openMagic',  function () { return openSignIn(); }), // legacy call sites
    openWaitlist: openWaitlist,
    // Not called anywhere today, but auth.js exposes both — keeping the surface
    // identical means a future call site can't break on the provider swap.
    openSettings: route('openSettings', openSettings),
    close: function () { return previous && previous.close ? previous.close() : undefined; },
    signOut:    route('signOut',    signOut),
    getUser:    route('getUser',    getUser),
    requireUser: requireUser,
    getSupabase: getSupabase,
  };

  // ─── Boot ───

  async function init() {
    var cfg = await loadConfig();
    if (!cfg.clerkPublishableKey) return; // not configured yet — leave the page alone

    var clerk = await ensureClerk();
    var repaint = async function () { paint(await getUser()); };
    clerk.addListener(repaint);
    await repaint();

    // ?signin=1 comes from the /app gate bouncing a signed-out visitor back here.
    if (new URLSearchParams(window.location.search).get('signin') === '1') {
      openSignIn();
    }

    document.querySelectorAll('[data-clerk-signin]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); openSignIn(); });
    });
    document.querySelectorAll('[data-clerk-signup]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); openSignUp(); });
    });
  }

  // init() reaches the network twice (config, then Clerk's script). Neither
  // failure should surface as an unhandled rejection — the page must still
  // render, with the login button simply not working, rather than throwing.
  function boot() {
    init().catch(function (e) {
      console.warn('[auth] Clerk init failed; sign-in unavailable', e);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
