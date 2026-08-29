// Returns the checkout link URL (Polar.so or Stripe) for the Founding Member tier.
// Configure via Vercel env var:
//   POLAR_CHECKOUT_URL (Polar product checkout link, e.g. https://buy.polar.sh/... or https://polar.sh/...)
//   OR STRIPE_PAYMENT_LINK (Stripe Payment Link, e.g. https://buy.stripe.com/...)

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const polarUrl = process.env.POLAR_CHECKOUT_URL || '';
  const stripeUrl = process.env.STRIPE_PAYMENT_LINK || '';

  let url = '';
  let provider = '';

  if (polarUrl && polarUrl.startsWith('https://')) {
    url = polarUrl;
    provider = 'polar';
  } else if (stripeUrl && stripeUrl.startsWith('https://')) {
    url = stripeUrl;
    provider = 'stripe';
  }

  if (!url) {
    return res.status(503).json({
      ok: false,
      error: 'Payment not configured yet. Add POLAR_CHECKOUT_URL or STRIPE_PAYMENT_LINK to Vercel env vars.',
    });
  }

  return res.status(200).json({ ok: true, url, provider });
}

