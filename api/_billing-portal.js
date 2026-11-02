// Served at /api/billing-portal, which vercel.json rewrites to
// /api/checkout?action=portal. It lives inside checkout.js's function because
// Vercel's Hobby plan caps a deployment at 12 functions, and the underscore
// keeps this file from counting as one.
//
// Sends the customer to Polar's hosted customer portal: cancel, change plan,
// update the card, download invoices.
//
// This is the portal's public address, not a per-customer session. The customer
// types their email and Polar emails them a one-time code, so no secret key is
// needed here and nobody can open someone else's billing page.
//
// SETUP: the portal is always on. Set its address in Vercel:
//
//   POLAR_PORTAL_URL = https://polar.sh/<your-org-slug>/portal
//
// Until it is set, the link goes to the contact page, where a cancellation
// request still reaches a person. That fallback must stay: the site promises
// cancelling online is always possible.

export function billingPortal(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const url = (process.env.POLAR_PORTAL_URL || '').trim();
  const configured = /^https:\/\/(sandbox\.)?polar\.sh\/[^/]+\/portal/.test(url);
  if (!configured) {
    if (url) console.error('[billing-portal] POLAR_PORTAL_URL is not a polar.sh portal link');
    res.statusCode = 302;
    res.setHeader('Location', '/contact.html?topic=billing');
    return res.end();
  }

  res.statusCode = 302;
  res.setHeader('Location', url);
  return res.end();
}
