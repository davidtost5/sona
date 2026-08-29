// Unit tests for Polar.so checkout endpoint.
// Run: node test/polar.test.mjs

// Set minimal test environment variables
process.env.POLAR_CHECKOUT_URL = 'https://buy.polar.sh/polar_cl_12345';
process.env.STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/stripe_12345';

// Mock Supabase to prevent hanging during imports
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';

// Simple handler loading
const checkoutModule = await import(new URL('../api/checkout.js', import.meta.url).href);
const checkoutHandler = checkoutModule.default;

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; this.ended = true; return this; },
    end(msg) { this.body = msg; this.ended = true; return this; },
  };
}

let passed = 0;
let failed = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`✓ ${description}`);
    passed++;
  } else {
    console.error(`✗ ${description}`);
    failed++;
  }
}

// --- Test 1: checkout.js without env vars ---
{
  const polarUrl = process.env.POLAR_CHECKOUT_URL;
  const stripeUrl = process.env.STRIPE_PAYMENT_LINK;
  delete process.env.POLAR_CHECKOUT_URL;
  delete process.env.STRIPE_PAYMENT_LINK;

  const res = mockRes();
  checkoutHandler({}, res);
  assert('checkout returns 503 when no payment link configured', res.statusCode === 503);
  
  // Restore env vars
  process.env.POLAR_CHECKOUT_URL = polarUrl;
  process.env.STRIPE_PAYMENT_LINK = stripeUrl;
}

// --- Test 2: checkout.js with POLAR_CHECKOUT_URL ---
{
  const res = mockRes();
  checkoutHandler({}, res);
  assert('checkout prioritizes POLAR_CHECKOUT_URL', res.statusCode === 200 && res.body.url === 'https://buy.polar.sh/polar_cl_12345' && res.body.provider === 'polar');
}

// --- Test 3: checkout.js fallback to STRIPE_PAYMENT_LINK ---
{
  const polarUrl = process.env.POLAR_CHECKOUT_URL;
  delete process.env.POLAR_CHECKOUT_URL;

  const res = mockRes();
  checkoutHandler({}, res);
  assert('checkout falls back to STRIPE_PAYMENT_LINK when POLAR_CHECKOUT_URL unset', res.statusCode === 200 && res.body.url === 'https://buy.stripe.com/stripe_12345' && res.body.provider === 'stripe');
  
  // Restore env var
  process.env.POLAR_CHECKOUT_URL = polarUrl;
}



console.log(`\nTest results: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
