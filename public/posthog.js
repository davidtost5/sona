// Shared browser PostHog initializer. Load once on every page before any
// page-specific analytics call sites; the SDK instance is available as window.posthog.
(function () {
  'use strict';

  var isDevelopment = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

  function missingConfiguration(variable) {
    var message = variable + ' variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ' + variable + ' is configured';
    if (isDevelopment) throw new Error(message);
  }

  fetch('/api/posthog-config', { cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error('PostHog configuration request failed');
      return response.json();
    })
    .then(function (config) {
      if (!config.key) return missingConfiguration('POSTHOG_PROJECT_TOKEN');
      if (!config.host) return missingConfiguration('POSTHOG_HOST');

      var script = document.createElement('script');
      script.src = new URL('/static/array.js', config.host).toString();
      script.async = true;
      script.onload = function () {
        window.posthog.init(config.key, {
          api_host: config.host,
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
        window.posthog.logger.info('browser log capture initialized', {
          event: 'browser_log_capture_initialized',
          application_area: 'shared_client'
        });
        window.dispatchEvent(new Event('sona:posthog-ready'));
      };
      script.onerror = function () {
        if (isDevelopment) throw new Error('PostHog SDK failed to load');
      };
      document.head.appendChild(script);
    })
    .catch(function (error) {
      if (isDevelopment) throw error;
    });
})();
