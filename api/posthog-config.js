export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const token = process.env.POSTHOG_PROJECT_TOKEN || null;
  const host = process.env.POSTHOG_HOST || null;

  if ((!token || !host) && process.env.NODE_ENV !== 'production') {
    const missing = !token ? 'POSTHOG_PROJECT_TOKEN' : 'POSTHOG_HOST';
    console.warn(`${missing} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missing} is configured`);
  }

  return res.status(200).json({ token, host, configured: Boolean(token && host) });
}
