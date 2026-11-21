// Shared browser PostHog initializer. Configuration comes from the server so
// production credentials remain in Vercel environment variables, not markup.
(function () {
  'use strict';

  var isDevelopment = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  var pendingIdentity = null;
  var pendingCaptures = [];
  var pendingLogs = [];
  var identifiedUserId = null;
  var initialized = false;
  var missingMessage = function (variable) {
    return variable + ' variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ' + variable + ' is configured';
  };

  function identify(user) {
    if (!user || !user.id) return;
    pendingIdentity = user;
    if (!initialized) return;
    try {
      if (identifiedUserId === user.id) return;
      if (identifiedUserId) window.posthog.reset();
      window.posthog.identify(user.id, user.properties || {});
      identifiedUserId = user.id;
      pendingIdentity = null;
    } catch (_) {
      // Analytics must never interrupt authentication or the app itself.
    }
  }

  function reset() {
    var hadIdentity = Boolean(pendingIdentity || identifiedUserId);
    pendingIdentity = null;
    identifiedUserId = null;
    if (!initialized || !hadIdentity) return;
    try { window.posthog.reset(); } catch (_) {}
  }

  function capture(event, properties) {
    if (!initialized) {
      pendingCaptures.push([event, properties]);
      return;
    }
    try { window.posthog.capture(event, properties); } catch (_) {}
  }

  function log(level, message, attributes) {
    if (!initialized) {
      pendingLogs.push([level, message, attributes]);
      return;
    }
    try {
      if (window.posthog.logger && typeof window.posthog.logger[level] === 'function') {
        window.posthog.logger[level](message, attributes);
      }
    } catch (_) {}
  }

  window.SonaPostHog = { identify: identify, reset: reset, capture: capture, log: log };
  window.dispatchEvent(new Event('sona_posthog_ready'));

  fetch('/api/posthog-config', { cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error('PostHog configuration request failed');
      return response.json();
    })
    .then(function (config) {
      if (!config.token || !config.host) {
        if (isDevelopment) throw new Error(missingMessage(config.token ? 'POSTHOG_HOST' : 'POSTHOG_PROJECT_TOKEN'));
        return;
      }

      var script = document.createElement('script');
      script.async = true;
      script.src = config.host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
      script.onload = function () {
        if (!window.posthog) return;
        window.posthog.init(config.token, {
          api_host: config.host,
          defaults: '2026-08-30',
          capture_exceptions: {
            capture_unhandled_errors: true,
            capture_unhandled_rejections: true,
            capture_console_errors: false
          },
          logs: {
            serviceName: 'sona-web',
            environment: isDevelopment ? 'development' : 'production'
          }
        });
        initialized = true;
        if (pendingIdentity) identify(pendingIdentity);
        pendingCaptures.splice(0).forEach(function (args) { capture(args[0], args[1]); });
        pendingLogs.splice(0).forEach(function (args) { log(args[0], args[1], args[2]); });
        log('info', 'browser analytics initialized', { initialization_source: 'shared_loader' });
      };
      document.head.appendChild(script);
    })
    .catch(function (error) {
      if (isDevelopment) setTimeout(function () { throw error; });
    });
})();
