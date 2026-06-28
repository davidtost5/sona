// ─── Canopy Auth Module ───
// Supabase-powered auth with modal UI
// Usage: <script src="auth.js"></script> — auto-initializes on DOMContentLoaded

(function () {
  'use strict';

  // ═══ CONFIG ═══
  // Credentials are fetched from /api/auth-config (which reads them from Vercel env vars).
  // No hardcoded keys in this file.

  let supabase = null;
  let currentUser = null;
  let configured = false;
  let initPromise = null;

  function ensureInitialized() {
    if (!initPromise) {
      initPromise = initSupabase();
    }
    return initPromise;
  }

  // ═══ INIT SUPABASE ═══
  async function initSupabase() {
    try {
      const res = await fetch('/api/auth-config', { cache: 'no-store' });
      const cfg = await res.json();
      if (!cfg.configured || !cfg.url || !cfg.anonKey) {
        console.info('[Sona Auth] Supabase auth not configured — add SUPABASE_ANON_KEY to Vercel env to enable real signup.');
        return false;
      }
      
      // Lazily load Supabase script from CDN if not already loaded
      if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
          script.onload = resolve;
          script.onerror = () => reject(new Error("Supabase script failed to load"));
          document.head.appendChild(script);
        });
      }

      if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        supabase = window.supabase.createClient(cfg.url, cfg.anonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        });
        configured = true;
        // Listen for auth state changes
        supabase.auth.onAuthStateChange((event, session) => {
          currentUser = session?.user || null;
          updateUI(currentUser);
        });
        // Check existing session
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user || null;
        updateUI(currentUser);
        return true;
      }
    } catch (e) {
      console.warn('[Sona Auth] Init failed:', e.message);
    }
    return false;
  }

  // ═══ AUTH STATE ═══
  async function getSession() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session || null;
  }

  async function signUp(email, password, fullName) {
    if (!supabase) return { error: { message: "Account creation is not open yet. Join the waitlist and we'll email you when your seat is ready." } };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    return { data, error };
  }

  async function signIn(email, password) {
    if (!supabase) return { error: { message: "Sign in is not available until account access opens." } };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    currentUser = null;
    updateUI(null);
    if (window.location.pathname.endsWith('/app.html')) window.location.href = '/';
  }

  async function signInWithProvider(provider) {
    if (!supabase) return { error: { message: 'Auth not configured' } };
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin }
    });
    return { data, error };
  }

  // Turn any error shape (Supabase AuthError, plain object, empty {}, string) into
  // a human-readable message. Guards against rendering "{}" / "[object Object]".
  function humanError(error, fallback) {
    const fb = fallback || 'Something went wrong. Please try again.';
    if (!error) return fb;
    let msg = typeof error === 'string'
      ? error
      : (error.message || error.error_description || error.error || error.msg || '');
    if (typeof msg !== 'string') msg = '';
    msg = msg.trim();
    if (!msg || msg === '{}' || msg === '[object Object]') return fb;
    return msg;
  }

  // ═══ AUTH MODAL STYLES ═══
  function injectStyles() {
    if (document.getElementById('canopy-auth-styles')) return;

    const style = document.createElement('style');
    style.id = 'canopy-auth-styles';
    style.textContent = `
      .auth-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 31, 15, 0.18);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.35s ease;
      }
      .auth-overlay.open {
        opacity: 1;
        pointer-events: auto;
      }
      .auth-modal {
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 44px 40px 40px;
        width: 100%;
        max-width: 400px;
        max-height: calc(100vh - 40px);
        overflow-y: auto;
        position: relative;
        transform: translateY(16px) scale(0.98);
        transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: var(--shadow-lg);
      }
      .auth-overlay.open .auth-modal {
        transform: translateY(0) scale(1);
      }
      .auth-close {
        position: absolute;
        top: 20px;
        right: 20px;
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background 0.2s, color 0.2s;
        color: var(--text-dim);
        font-size: 22px;
        line-height: 1;
      }
      .auth-close:hover { background: var(--bg-soft); color: var(--text); }
      .auth-logo {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 26px;
      }
      .auth-logo-icon {
        width: 32px; height: 32px;
        border-radius: 8px;
        background: linear-gradient(150deg, #34343c, #131316); border: 1px solid rgba(255,255,255,0.09);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .auth-logo-icon svg { width: 18px; height: 18px; display: block; }
      .auth-logo-text {
        font-family: 'Geist', -apple-system, sans-serif;
        font-size: 19px;
        font-weight: 600;
        letter-spacing: -0.5px;
        color: var(--text);
      }
      .auth-modal-title {
        font-family: 'Geist', -apple-system, sans-serif;
        font-size: 26px;
        font-weight: 600;
        color: var(--text);
        letter-spacing: -1px;
        line-height: 1.1;
        margin-bottom: 10px;
      }
      .auth-modal-sub {
        font-family: 'Geist', -apple-system, sans-serif;
        font-size: 14.5px;
        color: var(--text-mid);
        margin-bottom: 30px;
        line-height: 1.55;
      }
      .auth-form { display: flex; flex-direction: column; gap: 14px; }
      .auth-field {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }
      .auth-field label {
        font-family: 'Aeonik Pro', -apple-system, sans-serif;
        font-size: 12px;
        font-weight: 500;
        color: #8a8a84;
        letter-spacing: 0.4px;
        text-transform: uppercase;
      }
      .auth-field input {
        font-family: 'Geist', -apple-system, sans-serif;
        font-size: 15px;
        padding: 13px 0;
        border: none;
        border-bottom: 1.5px solid var(--border);
        border-radius: 0;
        background: transparent;
        color: var(--text);
        outline: none;
        transition: border-color 0.25s;
      }
      .auth-field input:focus { border-bottom-color: var(--accent); }
      .auth-field input::placeholder { color: var(--text-dim); }
      .auth-submit {
        font-family: 'Geist', -apple-system, sans-serif;
        font-size: 15px;
        font-weight: 500;
        padding: 14px;
        background: linear-gradient(180deg, var(--accent-2) 0%, var(--accent) 100%);
        color: #ffffff;
        border: none;
        border-radius: 999px;
        cursor: pointer;
        box-shadow: var(--shadow);
        transition: transform 0.2s, box-shadow 0.3s, filter 0.2s;
        margin-top: 18px;
      }
      .auth-submit:hover { transform: translateY(-1px); box-shadow: var(--shadow-lg); filter: brightness(1.05); }
      .auth-submit:active { transform: translateY(0); filter: brightness(0.96); }
      .auth-submit:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
      /* Waitlist success card */
      .wl-position { text-align: center; padding: 24px 16px; background: linear-gradient(180deg, var(--accent-soft), transparent); border: 1px solid rgba(107,99,245,0.18); border-radius: 16px; margin-bottom: 20px; }
      .wl-rank-eyebrow { font-family: 'Geist Mono', monospace; font-size: 10.5px; letter-spacing: 1px; color: var(--accent-2); text-transform: uppercase; }
      .wl-rank { font-size: 52px; font-weight: 700; letter-spacing: -2px; line-height: 1.05; margin: 6px 0; color: var(--text); font-variant-numeric: tabular-nums; }
      .wl-rank-sub { font-size: 13px; color: var(--text-mid); }
      .wl-next { display: flex; flex-direction: column; gap: 14px; padding: 6px 4px; }
      .wl-step { display: flex; gap: 12px; align-items: flex-start; }
      .wl-step .wl-tick { width: 22px; height: 22px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-2); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; flex-shrink: 0; }
      .wl-step b { display: block; font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 3px; }
      .wl-step span { font-size: 13px; color: var(--text-mid); line-height: 1.5; }
      .wl-step span span { color: var(--text); font-weight: 500; }
      .auth-divider {
        display: flex;
        align-items: center;
        gap: 16px;
        margin: 8px 0;
        color: var(--text-dim);
        font-size: 13px;
        font-family: 'Geist', -apple-system, sans-serif;
      }
      .auth-divider::before, .auth-divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--border);
      }
      .auth-social {
        display: flex;
        gap: 12px;
      }
      .auth-social-btn {
        flex: 1;
        padding: 12px;
        border: 1.5px solid var(--border);
        border-radius: 10px;
        background: var(--bg);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-family: 'Geist', -apple-system, sans-serif;
        font-size: 14px;
        font-weight: 500;
        color: var(--text);
        transition: border-color 0.2s, background 0.2s;
      }
      .auth-social-btn:hover { border-color: var(--accent); background: var(--accent-soft); }
      .auth-social-btn svg { width: 18px; height: 18px; }
      .settings-rows {
        display: flex; flex-direction: column;
        background: var(--bg-soft);
        border: 1px solid var(--border);
        border-radius: 12px;
        margin-bottom: 18px; overflow: hidden;
      }
      .settings-row {
        display: flex; justify-content: space-between; align-items: center;
        padding: 13px 16px;
        border-bottom: 1px solid var(--border);
        font-family: 'Geist', -apple-system, sans-serif;
        font-size: 13.5px;
      }
      .settings-row:last-child { border-bottom: 0; }
      .settings-row-key { color: var(--text-mid); font-weight: 500; }
      .settings-row-val { color: var(--text); font-weight: 500; }
      .settings-actions { display: flex; flex-direction: column; gap: 9px; }
      .settings-btn {
        font-family: 'Geist', -apple-system, sans-serif;
        font-size: 14px; font-weight: 500;
        padding: 12px 16px;
        background: #fff; color: #15151a;
        border: 1px solid rgba(0,0,0,0.12);
        border-radius: 10px; cursor: pointer;
        transition: background 0.2s, border-color 0.2s;
      }
      .settings-btn:hover { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.2); }
      .settings-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .settings-btn.danger { color: #c85050; border-color: rgba(200,80,80,0.25); }
      .settings-btn.danger:hover { background: rgba(200,80,80,0.05); border-color: rgba(200,80,80,0.4); }
      .auth-toggle {
        text-align: center;
        margin-top: 16px;
        font-family: 'Geist', -apple-system, sans-serif;
        font-size: 14px;
        color: #5a5a56;
      }
      .auth-toggle a {
        color: #4f46e5;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
      }
      .auth-toggle a:hover { text-decoration: underline; }
      .auth-error {
        font-family: 'Aeonik Pro', -apple-system, sans-serif;
        font-size: 13px;
        color: #c85050;
        background: rgba(200,80,80,0.06);
        border: 1px solid rgba(200,80,80,0.15);
        padding: 10px 14px;
        border-radius: 8px;
        display: none;
      }
      .auth-error.visible { display: block; }
      .auth-success {
        font-family: 'Aeonik Pro', -apple-system, sans-serif;
        font-size: 13px;
        color: #a3b858;
        background: rgba(200,230,74,0.08);
        border: 1px solid rgba(200,230,74,0.2);
        padding: 10px 14px;
        border-radius: 8px;
        display: none;
      }
      .auth-success.visible { display: block; }

      /* User menu (logged in state) */
      .user-menu {
        position: relative;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
      }
      .user-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #4f46e5;
        color: #f5f4f0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Aeonik Pro', sans-serif;
        font-size: 13px;
        font-weight: 600;
      }
      .user-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 8px;
        background: #f5f4f0;
        border: 1px solid #ddd9d0;
        border-radius: 12px;
        padding: 8px;
        min-width: 180px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        opacity: 0;
        pointer-events: none;
        transform: translateY(-4px);
        transition: opacity 0.2s, transform 0.2s;
        z-index: 10001;
      }
      .user-dropdown.open { opacity: 1; pointer-events: auto; transform: translateY(0); }
      .user-dropdown-item {
        display: block;
        width: 100%;
        padding: 8px 12px;
        border: none;
        background: transparent;
        text-align: left;
        cursor: pointer;
        font-family: 'Geist', -apple-system, sans-serif;
        font-size: 13px;
        color: var(--text-mid);
        border-radius: 6px;
        transition: background 0.15s;
      }
      .user-dropdown-item:hover { background: var(--bg-soft); }
      .user-dropdown-item.danger { color: #c85050; }
      .user-dropdown-email {
        padding: 10px 14px 8px;
        font-size: 12px;
        color: var(--text-dim);
        border-bottom: 1px solid var(--border);
        margin-bottom: 4px;
        font-family: 'Geist Mono', monospace;
      }

      @media (max-width: 480px) {
        .auth-modal { padding: 32px 24px; margin: 16px; border-radius: 16px; }
        .auth-modal-title { font-size: 24px; }
        .auth-social { flex-direction: column; }
      }
    `;
    document.head.appendChild(style);
  }

  // ═══ BUILD MODAL HTML ═══
  function createModal() {
    if (document.getElementById('auth-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.className = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-modal">
        <button class="auth-close" aria-label="Close">&times;</button>

        <!-- LOGIN VIEW -->
        <div id="auth-login-view">
          <div class="auth-logo">
            <span class="auth-logo-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M5 15 Q8 9 12 12 Q16 15 19 9" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M19 3.6 C19.15 5.1 20.3 6.25 21.8 6.4 C20.3 6.55 19.15 7.7 19 9.2 C18.85 7.7 17.7 6.55 16.2 6.4 C17.7 6.25 18.85 5.1 19 3.6 Z" fill="#8b84ff"/></svg></span>
            <span class="auth-logo-text">Sona</span>
          </div>
          <div class="auth-modal-title">Welcome back</div>
          <div class="auth-modal-sub">Sign in to your Sona account</div>
          <div class="auth-error" id="auth-login-error"></div>
          <form class="auth-form" id="auth-login-form">
            <div class="auth-field">
              <label for="login-email">Email</label>
              <input type="email" id="login-email" placeholder="you@company.com" required autocomplete="email">
            </div>
            <div class="auth-field">
              <label for="login-password">Password</label>
              <input type="password" id="login-password" placeholder="Enter your password" required autocomplete="current-password">
            </div>
            <button type="submit" class="auth-submit">Sign in</button>
          </form>
          <div class="auth-toggle">
            Don't have an account? <a id="auth-show-signup">Create account</a>
          </div>
        </div>

        <!-- WAITLIST VIEW (mock mode — no Supabase configured) -->
        <div id="auth-waitlist-view" style="display:none">
          <div class="auth-logo">
            <span class="auth-logo-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M5 15 Q8 9 12 12 Q16 15 19 9" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M19 3.6 C19.15 5.1 20.3 6.25 21.8 6.4 C20.3 6.55 19.15 7.7 19 9.2 C18.85 7.7 17.7 6.55 16.2 6.4 C17.7 6.25 18.85 5.1 19 3.6 Z" fill="#8b84ff"/></svg></span>
            <span class="auth-logo-text">Sona</span>
          </div>
          <div class="auth-modal-title">Request early access</div>
          <div class="auth-modal-sub">Sona is opening in waves. Drop your details and we'll email you the moment your seat is ready — usually within a week.</div>
          <div class="auth-error" id="auth-waitlist-error"></div>
          <div class="auth-success" id="auth-waitlist-success"></div>
          <form class="auth-form" id="auth-waitlist-form">
            <div class="auth-field">
              <label for="wl-name">Full name</label>
              <input type="text" id="wl-name" placeholder="Jane Smith" required autocomplete="name">
            </div>
            <div class="auth-field">
              <label for="wl-email">Work email</label>
              <input type="email" id="wl-email" placeholder="jane@company.com" required autocomplete="email">
            </div>
            <div class="auth-field">
              <label for="wl-role">What will you use it for?</label>
              <input type="text" id="wl-role" placeholder="LinkedIn growth · X threads · agency clients..." autocomplete="off">
            </div>
            <button type="submit" class="auth-submit">Reserve my seat</button>
          </form>
          <!-- Success card swaps in here -->
          <div id="auth-waitlist-done" style="display:none;">
            <div class="wl-position">
              <div class="wl-rank-eyebrow">YOUR POSITION</div>
              <div class="wl-rank" id="wl-rank">#247</div>
              <div class="wl-rank-sub">in the queue · invites going out weekly</div>
            </div>
            <div class="wl-next">
              <div class="wl-step"><span class="wl-tick">✓</span><div><b>You're on the list.</b><span>We'll email <span id="wl-done-email">your inbox</span> when your seat is ready.</span></div></div>
              <div class="wl-step"><span class="wl-tick">→</span><div><b>Skip the line.</b><span>Share Sona with a friend — every signup moves you up 50 spots.</span></div></div>
            </div>
            <button type="button" class="auth-submit" id="wl-share" style="margin-top:14px;">Copy invite link</button>
          </div>
        </div>

        <!-- SIGNUP VIEW -->
        <div id="auth-signup-view" style="display:none">
          <div class="auth-logo">
            <span class="auth-logo-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M5 15 Q8 9 12 12 Q16 15 19 9" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M19 3.6 C19.15 5.1 20.3 6.25 21.8 6.4 C20.3 6.55 19.15 7.7 19 9.2 C18.85 7.7 17.7 6.55 16.2 6.4 C17.7 6.25 18.85 5.1 19 3.6 Z" fill="#8b84ff"/></svg></span>
            <span class="auth-logo-text">Sona</span>
          </div>
          <div class="auth-modal-title">Create your account</div>
          <div class="auth-modal-sub">You'll be in the studio in 10 seconds. Browse outliers, save ideas to your swipe board, hooks library coming soon.</div>
          <div class="auth-error" id="auth-signup-error"></div>
          <div class="auth-success" id="auth-signup-success"></div>
          <form class="auth-form" id="auth-signup-form">
            <div class="auth-field">
              <label for="signup-name">Full name</label>
              <input type="text" id="signup-name" placeholder="Jane Smith" required autocomplete="name">
            </div>
            <div class="auth-field">
              <label for="signup-email">Email</label>
              <input type="email" id="signup-email" placeholder="jane@company.com" required autocomplete="email">
            </div>
            <div class="auth-field">
              <label for="signup-password">Password</label>
              <input type="password" id="signup-password" placeholder="Min 8 characters" required minlength="8" autocomplete="new-password">
            </div>
            <button type="submit" class="auth-submit">Create account</button>
          </form>
          <div class="auth-toggle">
            Already have an account? <a id="auth-show-login">Sign in</a>
          </div>
        </div>

        <!-- SETTINGS VIEW -->
        <div id="auth-settings-view" style="display:none">
          <div class="auth-logo">
            <span class="auth-logo-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M5 15 Q8 9 12 12 Q16 15 19 9" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M19 3.6 C19.15 5.1 20.3 6.25 21.8 6.4 C20.3 6.55 19.15 7.7 19 9.2 C18.85 7.7 17.7 6.55 16.2 6.4 C17.7 6.25 18.85 5.1 19 3.6 Z" fill="#8b84ff"/></svg></span>
            <span class="auth-logo-text">Sona</span>
          </div>
          <div class="auth-modal-title">Account settings</div>
          <div class="auth-modal-sub">Manage your Sona account.</div>
          <div class="auth-error" id="auth-settings-error"></div>
          <div class="auth-success" id="auth-settings-success"></div>
          <div class="settings-rows">
            <div class="settings-row">
              <div class="settings-row-key">Email</div>
              <div class="settings-row-val" id="settings-email">—</div>
            </div>
            <div class="settings-row">
              <div class="settings-row-key">Plan</div>
              <div class="settings-row-val">Beta · free</div>
            </div>
            <div class="settings-row">
              <div class="settings-row-key">Member since</div>
              <div class="settings-row-val" id="settings-since">—</div>
            </div>
          </div>
          <div class="settings-actions">
            <button type="button" class="settings-btn" id="settings-reset-pw">Send password reset email</button>
            <button type="button" class="settings-btn danger" id="settings-signout">Sign out</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Announce auth errors/successes to screen readers as they appear
    overlay.querySelectorAll('.auth-error').forEach(el => {
      el.setAttribute('role', 'alert');
      el.setAttribute('aria-live', 'assertive');
    });
    overlay.querySelectorAll('.auth-success').forEach(el => {
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
    });

    // ─── Event listeners ───
    overlay.querySelector('.auth-close').addEventListener('click', closeAuthModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAuthModal(); });

    document.getElementById('auth-show-signup').addEventListener('click', () => switchView('signup'));
    document.getElementById('auth-show-login').addEventListener('click', () => switchView('login'));

    // ── Settings view handlers ──
    const resetBtn = document.getElementById('settings-reset-pw');
    if (resetBtn) resetBtn.addEventListener('click', async () => {
      if (!supabase || !currentUser?.email) return;
      const errEl = document.getElementById('auth-settings-error');
      const okEl = document.getElementById('auth-settings-success');
      errEl.classList.remove('visible'); okEl.classList.remove('visible');
      resetBtn.disabled = true; const orig = resetBtn.textContent;
      resetBtn.textContent = 'Sending…';
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(currentUser.email, {
          redirectTo: window.location.origin + '/app.html'
        });
        if (error) {
          errEl.textContent = humanError(error, 'Could not send reset email. Try again.');
          errEl.classList.add('visible');
        } else {
          okEl.textContent = `Reset link sent to ${currentUser.email}.`;
          okEl.classList.add('visible');
        }
      } catch (e) {
        errEl.textContent = 'Could not send reset email. Try again.';
        errEl.classList.add('visible');
      }
      resetBtn.disabled = false; resetBtn.textContent = orig;
    });
    const settingsSignoutBtn = document.getElementById('settings-signout');
    if (settingsSignoutBtn) settingsSignoutBtn.addEventListener('click', async () => {
      closeAuthModal();
      await signOut();
      window.location.href = '/';
    });
    // Login form
    document.getElementById('auth-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('.auth-submit');
      const errEl = document.getElementById('auth-login-error');
      btn.disabled = true;
      btn.textContent = 'Signing in...';
      errEl.classList.remove('visible');

      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const { data, error } = await signIn(email, password);

      if (error) {
        errEl.textContent = humanError(error, 'Could not sign in. Check your email and password.');
        errEl.classList.add('visible');
        btn.disabled = false;
        btn.textContent = 'Sign in';
      } else {
        currentUser = data.user;
        updateUI(data.user);
        // Real session — go to the app
        window.location.href = '/app.html';
        return;
      }
    });

    // Signup form
    document.getElementById('auth-signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('.auth-submit');
      const errEl = document.getElementById('auth-signup-error');
      const successEl = document.getElementById('auth-signup-success');
      btn.disabled = true;
      btn.textContent = 'Creating account...';
      errEl.classList.remove('visible');
      successEl.classList.remove('visible');

      // Guard: if Supabase auth isn't configured yet, route to waitlist as a clean fallback
      if (!configured) {
        errEl.textContent = "Sign-up isn't open yet — join the waitlist and we'll email you the moment it is.";
        errEl.classList.add('visible');
        setTimeout(() => switchView('waitlist'), 1200);
        btn.disabled = false; btn.textContent = 'Create account';
        return;
      }

      const name = document.getElementById('signup-name').value;
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;
      const { data, error } = await signUp(email, password, name);

      if (error) {
        errEl.textContent = humanError(error, "We couldn't create your account. Please try again, or contact support if it keeps happening.");
        errEl.classList.add('visible');
      } else if (data?.session) {
        // Auto-signed-in (email confirmation disabled) — go straight to app
        window.location.href = '/app.html';
        return;
      } else {
        successEl.textContent = "Check your email for the confirmation link, then we'll take you to the app.";
        successEl.classList.add('visible');
        e.target.reset();
      }
      btn.disabled = false;
      btn.textContent = 'Create account';
    });

    // Waitlist form — captures to Supabase, then swaps to the success card with position
    document.getElementById('auth-waitlist-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const btn = form.querySelector('.auth-submit');
      const errEl = document.getElementById('auth-waitlist-error');
      btn.disabled = true; btn.textContent = 'Reserving...';
      errEl.classList.remove('visible');

      const email = document.getElementById('wl-email').value;
      const result = await window.CanopyData.submitWaitlist({
        name: document.getElementById('wl-name').value,
        email,
        company: document.getElementById('wl-role').value,
      });

      if (result.ok) {
        // Generate a stable-feeling position based on email hash so each user sees the same number
        let h = 0; for (let i = 0; i < email.length; i++) h = ((h<<5)-h) + email.charCodeAt(i) | 0;
        const pos = 180 + (Math.abs(h) % 220); // range 180–399
        document.getElementById('wl-rank').textContent = '#' + pos.toLocaleString();
        document.getElementById('wl-done-email').textContent = email;
        form.style.display = 'none';
        document.querySelector('#auth-waitlist-view .auth-modal-sub').style.display = 'none';
        document.querySelector('#auth-waitlist-view .auth-modal-title').textContent = "You're in. 🎉";
        document.getElementById('auth-waitlist-done').style.display = 'block';
      } else {
        errEl.textContent = result.error || 'Something went wrong. Try again?';
        errEl.classList.add('visible');
        btn.disabled = false; btn.textContent = 'Reserve my seat';
      }
    });

    // Copy invite link button
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'wl-share') {
        const url = window.location.origin + '/?ref=invite';
        navigator.clipboard?.writeText(url);
        e.target.textContent = 'Copied ✓ · Thanks for sharing';
      }
    });

    // Social auth
    overlay.querySelectorAll('.auth-social-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        signInWithProvider(btn.dataset.provider);
      });
    });

    // ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAuthModal();
    });
  }

  function switchView(view) {
    document.getElementById('auth-login-view').style.display = view === 'login' ? '' : 'none';
    document.getElementById('auth-signup-view').style.display = view === 'signup' ? '' : 'none';
    document.getElementById('auth-waitlist-view').style.display = view === 'waitlist' ? '' : 'none';
    const settingsView = document.getElementById('auth-settings-view');
    if (settingsView) settingsView.style.display = view === 'settings' ? '' : 'none';
    // Clear errors
    document.querySelectorAll('.auth-error, .auth-success').forEach(el => el.classList.remove('visible'));
    // When opening settings, populate user data
    if (view === 'settings' && currentUser) populateSettings();
  }

  function populateSettings() {
    const emailEl = document.getElementById('settings-email');
    const sinceEl = document.getElementById('settings-since');
    if (emailEl) emailEl.textContent = currentUser.email || '—';
    if (sinceEl && currentUser.created_at) {
      const d = new Date(currentUser.created_at);
      sinceEl.textContent = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }
  }

  // ═══ OPEN / CLOSE ═══
  async function openAuthModal(view = 'login') {
    createModal();
    await ensureInitialized();
    // Settings is gated on being logged in
    if (view === 'settings' && !currentUser) view = 'login';
    // Mock mode (no Supabase): non-settings entry points become the waitlist
    else if (view !== 'settings' && (!configured || !supabase)) view = 'waitlist';
    switchView(view);
    requestAnimationFrame(() => {
      document.getElementById('auth-overlay').classList.add('open');
    });
    document.body.style.overflow = 'hidden';
  }

  function closeAuthModal() {
    const overlay = document.getElementById('auth-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ═══ UI UPDATE (logged-in / logged-out) ═══
  function updateUI(user) {
    // Update all nav-right sections
    document.querySelectorAll('.nav-right').forEach(navRight => {
      if (!navRight.dataset.loggedOutHtml) navRight.dataset.loggedOutHtml = navRight.innerHTML;
      if (user) {
        const initials = (user.user_metadata?.full_name || user.email || 'U')
          .split(' ')
          .map(w => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();

        navRight.innerHTML = `
          <div class="user-menu">
            <div class="user-avatar">${initials}</div>
            <div class="user-dropdown" id="user-dropdown">
              <div class="user-dropdown-email">${user.email}</div>
              <button class="user-dropdown-item" id="auth-dashboard" type="button">Dashboard</button>
              <button class="user-dropdown-item" id="auth-settings" type="button">Settings</button>
              <button class="user-dropdown-item danger" id="auth-signout">Sign out</button>
            </div>
          </div>
        `;

        const userMenu = navRight.querySelector('.user-menu');
        const dropdown = navRight.querySelector('.user-dropdown');
        userMenu.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.toggle('open');
        });
        document.addEventListener('click', () => dropdown.classList.remove('open'));

        navRight.querySelector('#auth-dashboard').addEventListener('click', (e) => {
          e.stopPropagation();
          window.location.href = '/app.html';
        });
        navRight.querySelector('#auth-settings').addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('open');
          openAuthModal('settings');
        });
        navRight.querySelector('#auth-signout').addEventListener('click', async (e) => {
          e.stopPropagation();
          await signOut();
          // Guarantee a clean refresh so all UI state resets
          window.location.href = '/';
        });
      } else if (navRight.dataset.loggedOutHtml) {
        navRight.innerHTML = navRight.dataset.loggedOutHtml;
        bindAuthTriggers();
      }
    });

    // Update mobile menu CTA
    document.querySelectorAll('.mobile-menu-cta').forEach(cta => {
      if (user) {
        cta.textContent = 'Dashboard';
        cta.onclick = (e) => { e.preventDefault(); window.location.href = '/app.html'; };
      } else {
        cta.textContent = 'Log in';
        cta.onclick = (e) => { e.preventDefault(); openAuthModal('login'); };
      }
    });
  }

  // ═══ BIND AUTH TRIGGERS ═══
  function bindAuthTriggers() {
    // Log in buttons
    document.querySelectorAll('.auth-trigger-login, .btn-primary').forEach(el => {
      if (el.textContent.trim().toLowerCase() === 'log in') {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          openAuthModal('login');
        });
      }
    });

    // Request access / Sign up buttons
    document.querySelectorAll('.auth-trigger-signup, [href="#"]').forEach(el => {
      const text = el.textContent.trim().toLowerCase();
      if (text === 'request access' || text === 'get started' || text === 'start free trial') {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          openAuthModal('signup');
        });
      }
    });

    // Mobile menu login
    document.querySelectorAll('.mobile-menu-cta').forEach(cta => {
      if (cta.textContent.trim().toLowerCase() === 'log in') {
        cta.addEventListener('click', (e) => {
          e.preventDefault();
          // Close mobile menu first
          const menuBtn = document.querySelector('.mobile-menu-btn');
          const mobileMenu = document.querySelector('.mobile-menu');
          if (menuBtn && mobileMenu) {
            menuBtn.classList.remove('open');
            mobileMenu.classList.remove('open');
            document.body.style.overflow = '';
          }
          openAuthModal('login');
        });
      }
    });
  }

  // ═══ INIT ═══
  async function init() {
    injectStyles();

    let hasSession = false;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          hasSession = true;
          break;
        }
      }
    } catch (e) {}

    if (hasSession) {
      await ensureInitialized();
      if (supabase) {
        try {
          const session = await getSession();
          if (session?.user) {
            currentUser = session.user;
            updateUI(session.user);
          } else {
            bindAuthTriggers();
          }
        } catch (e) {
          bindAuthTriggers();
        }
      } else {
        bindAuthTriggers();
      }
    } else {
      bindAuthTriggers();
    }
  }

  // ═══ EXPOSE GLOBALLY ═══
  const queue = (window.CanopyAuth && window.CanopyAuth._queue) || [];

  window.CanopyAuth = {
    openLogin: () => openAuthModal('login'),
    openSignup: () => openAuthModal('signup'),
    openWaitlist: () => openAuthModal('waitlist'),
    openSettings: () => openAuthModal('settings'),
    close: closeAuthModal,
    getUser: () => currentUser,
    signOut: () => signOut().then(() => { window.location.href = '/'; }),
  };

  // Replay queued actions
  for (const [action] of queue) {
    if (typeof window.CanopyAuth[action] === 'function') {
      window.CanopyAuth[action]();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
