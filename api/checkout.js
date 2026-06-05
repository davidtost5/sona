// Returns the Stripe Payment Link URL for the Founding Member tier.
// Configure via Vercel env var: STRIPE_PAYMENT_LINK
//
// Two ways to set this up:
//
// EASIEST (recommended for now) — Stripe Payment Link:
//   1. Stripe Dashboard → Products → Create product ("Sona Founding Member", $99/year)
//   2. Click "Create payment link" on the product
//   3. Copy the URL (https://buy.stripe.com/xxxxx)
//   4. Add to Vercel env: STRIPE_PAYMENT_LINK = (paste it)
//   5. Done — the Claim button will redirect users straight to Stripe.
//
// LATER (when you want webhooks / customer attribution):
//   Swap this to create a Checkout Session via the Stripe API + STRIPE_SECRET_KEY.

export default function handler(req, res) {
  const url = process.env.STRIPE_PAYMENT_LINK || '';
  res.setHeader('Cache-Control', 'no-store');

  if (!url || !url.startsWith('https://')) {
    return res.status(503).json({
      ok: false,
      error: 'Payment not configured yet. Add STRIPE_PAYMENT_LINK to Vercel env vars.',
    });
  }

  return res.status(200).json({ ok: true, url });
}
