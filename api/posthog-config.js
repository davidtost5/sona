// Returns the public browser PostHog configuration. The project key is designed
// to be exposed client-side; keep every non-public PostHog credential server-only.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const key = (process.env.POSTHOG_PROJECT_TOKEN || '').trim();
  const host = (process.env.POSTHOG_HOST || '').trim();
  const configured = Boolean(key && host);

  if (!configured && process.env.VERCEL_ENV !== 'production') {
    console.warn('POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_PROJECT_TOKEN is configured');
  }

  return res.status(200).json({ key, host, configured });
}
