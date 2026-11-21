import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';

const token = process.env.POSTHOG_PROJECT_TOKEN || null;
const host = process.env.POSTHOG_HOST || null;
const isProduction = process.env.NODE_ENV === 'production';
let logger = null;
let provider = null;

if (!token || !host) {
  if (!isProduction) {
    const missing = token ? 'POSTHOG_HOST' : 'POSTHOG_PROJECT_TOKEN';
    console.warn(`${missing} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missing} is configured`);
  }
} else {
  const exporter = new OTLPLogExporter({
    url: `${host.replace(/\/$/, '')}/i/v1/logs`,
    headers: { Authorization: `Bearer ${token}` },
  });
  provider = new LoggerProvider({
    resource: resourceFromAttributes({
      'service.name': 'sona-api',
      'deployment.environment': process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    }),
    processors: [new SimpleLogRecordProcessor(exporter)],
  });
  logger = provider.getLogger('sona-posthog');
}

export const posthogLog = {
  info(body, attributes) {
    try {
      logger?.emit({ severityText: 'info', body, attributes });
    } catch (_) {}
  },
};

if (provider) {
  process.once('SIGTERM', () => {
    provider.shutdown().catch(() => {});
  });
}
