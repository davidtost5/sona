// Returns the Stripe Payment Link for a given plan.
//
// This replaces a single-link version written for the old $99 Founding tier,
// which returned that one link no matter which plan was asked for. The pricing
// ladder is now Free / Creator $19 / Creator Pro $39, each with an annual
// option, so there are four paid price points and four links.
//
// SETUP (Stripe Dashboard → Products → Create product → Create payment link):
//
//   STRIPE_LINK_CREATOR_MONTHLY = https://buy.stripe.com/...   ($19 / month)
//   STRIPE_LINK_CREATOR_ANNUAL  = https://buy.stripe.com/...   ($190 / year)
//   STRIPE_LINK_PRO_MONTHLY     = https://buy.stripe.com/...   ($39 / month)
//   STRIPE_LINK_PRO_ANNUAL      = https://buy.stripe.com/...   ($390 / year)
//
// Add them in Vercel → Settings → Environment Variables, then redeploy.
// Set only the ones you have; an unset plan reports itself as unconfigured
// rather than silently sending the customer to the wrong price.
//
// There is deliberately NO fallback to the old STRIPE_PAYMENT_LINK variable.
// That variable still holds the retired $99 test link, and falling back to it
// is precisely the bug this file exists to fix.

const PLANS = {
  'creator-monthly': { env: 'STRIPE_LINK_CREATOR_MONTHLY', label: 'Creator · monthly', price: '$19/mo' },
  'creator-annual': { env: 'STRIPE_LINK_CREATOR_ANNUAL', label: 'Creator · annual', price: '$190/yr' },
  'pro-monthly': { env: 'STRIPE_LINK_PRO_MONTHLY', label: 'Creator Pro · monthly', price: '$39/mo' },
  'pro-annual': { env: 'STRIPE_LINK_PRO_ANNUAL', label: 'Creator Pro · annual', price: '$390/yr' },
};

// Legacy callers (the in-app upsell) hit this endpoint with no plan at all.
// The upsell advertises $19/mo, so that is what they get.
const DEFAULT_PLAN = 'creator-monthly';

const isTestLink = (url) => /\/test_/.test(url) || /^https:\/\/buy\.stripe\.com\/test/.test(url);

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const requested = String(
    (req.query && req.query.plan) || (body && body.plan) || DEFAULT_PLAN
  ).trim().toLowerCase();

  const plan = PLANS[requested];
  if (!plan) {
    return res.status(400).json({
      ok: false,
      error: `Unknown plan "${requested}".`,
      validPlans: Object.keys(PLANS),
    });
  }

  const url = (process.env[plan.env] || '').trim();
  if (!url || !url.startsWith('https://')) {
    return res.status(503).json({
      ok: false,
      configured: false,
      plan: requested,
      error: `${plan.label} is not configured. Set ${plan.env} in the Vercel environment.`,
    });
  }

  // A test link in production is how the retired $99 tier stayed live for weeks
  // without anyone noticing: checkout "worked", it just pointed at test mode.
  // Fail loudly instead — a visible error beats a customer in a fake checkout.
  const test = isTestLink(url);
  if (test && process.env.VERCEL_ENV === 'production') {
    console.error(`[checkout] ${plan.env} holds a TEST-mode link in production.`);
    return res.status(503).json({
      ok: false,
      configured: false,
      plan: requested,
      error: `${plan.label} is set to a Stripe TEST link. Replace ${plan.env} with the live payment link.`,
    });
  }

  return res.status(200).json({
    ok: true,
    url,
    plan: requested,
    price: plan.price,
    mode: test ? 'test' : 'live',   // surfaced so a misconfiguration is greppable
  });
}
