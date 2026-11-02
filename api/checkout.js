// Returns the Polar checkout link for a given plan.
//
// The pricing ladder is Free / Creator €19 / Creator Pro €39, each with a yearly
// option, so there are four paid price points and four links.
//
// SETUP (Polar → Products → create Creator and Creator Pro, each with a monthly
// and a yearly product → Products → Checkout Links → one link per product):
//
//   POLAR_LINK_CREATOR_MONTHLY = your Creator monthly checkout link   (€19 / month)
//   POLAR_LINK_CREATOR_ANNUAL  = your Creator yearly checkout link    (€190 / year)
//   POLAR_LINK_PRO_MONTHLY     = your Creator Pro monthly link        (€39 / month)
//   POLAR_LINK_PRO_ANNUAL      = your Creator Pro yearly link         (€390 / year)
//
// Add them in Vercel → Settings → Environment Variables, then redeploy.
// Set only the ones you have; an unset plan reports itself as unconfigured
// rather than silently sending the customer to the wrong price.

import { billingPortal } from './_billing-portal.js';

const PLANS = {
  'creator-monthly': { env: 'POLAR_LINK_CREATOR_MONTHLY', label: 'Creator · monthly', price: '€19/mo' },
  'creator-annual': { env: 'POLAR_LINK_CREATOR_ANNUAL', label: 'Creator · annual', price: '€190/yr' },
  'pro-monthly': { env: 'POLAR_LINK_PRO_MONTHLY', label: 'Creator Pro · monthly', price: '€39/mo' },
  'pro-annual': { env: 'POLAR_LINK_PRO_ANNUAL', label: 'Creator Pro · annual', price: '€390/yr' },
};

// Legacy callers (the in-app upsell) hit this endpoint with no plan at all.
// The upsell advertises €19/mo, so that is what they get.
const DEFAULT_PLAN = 'creator-monthly';

// Polar's sandbox is a separate environment on its own hosts.
const isTestLink = (url) => /^https:\/\/[^/]*sandbox[^/]*\//.test(url);

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // /api/billing-portal is rewritten here; see _billing-portal.js for why.
  if (req.query && req.query.action === 'portal') return billingPortal(req, res);

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

  // A sandbox link in production would send customers to a fake checkout.
  // Fail loudly instead — a visible error beats a customer in a fake checkout.
  const test = isTestLink(url);
  if (test && process.env.VERCEL_ENV === 'production') {
    console.error(`[checkout] ${plan.env} holds a sandbox link in production.`);
    return res.status(503).json({
      ok: false,
      configured: false,
      plan: requested,
      error: `${plan.label} is set to a Polar sandbox link. Replace ${plan.env} with the live checkout link.`,
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
