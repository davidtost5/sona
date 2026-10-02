// Served at /api/billing-portal, which vercel.json rewrites to
// /api/checkout?action=portal. It lives inside checkout.js's function because
// Vercel's Hobby plan caps a deployment at 12 functions, and the underscore
// keeps this file from counting as one.
//
// Sends the customer to Stripe's hosted billing portal: cancel, switch between
// monthly and annual, update the card, download invoices.
//
// This uses the portal's *login link*, not a per-customer session. The customer
// types their email and Stripe emails them a one-time code, so no secret key is
// needed here and nobody can open someone else's billing page.
//
// SETUP (Stripe Dashboard → Settings → Billing → Customer portal):
//   1. Turn on "Cancel subscriptions" → "At the end of the billing period"
//   2. Turn on "Switch plans" and add the four Creator / Creator Pro prices
//   3. Save, then copy the "Login link" and set it in Vercel:
//
//   STRIPE_PORTAL_LOGIN_URL = https://billing.stripe.com/p/login/...
//
// Until it is set, the link goes to the contact page, where a cancellation
// request still reaches a person. That fallback must stay: the site promises
// cancelling online is always possible.

export function billingPortal(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const url = (process.env.STRIPE_PORTAL_LOGIN_URL || '').trim();
  const configured = /^https:\/\/billing\.stripe\.com\//.test(url);
  if (!configured) {
    if (url) console.error('[billing-portal] STRIPE_PORTAL_LOGIN_URL is not a billing.stripe.com link');
    res.statusCode = 302;
    res.setHeader('Location', '/contact.html?topic=billing');
    return res.end();
  }

  res.statusCode = 302;
  res.setHeader('Location', url);
  return res.end();
}
