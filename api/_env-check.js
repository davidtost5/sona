// Environment validation startup check
// This file validates that required environment variables are configured
// and provides clear error messages when they're missing.
//
// Usage: import { validateEnvironment, logEnvironmentStatus } from './_env-check.js';
//        const envStatus = validateEnvironment();
//        if (!envStatus.isValid) { ... }

const REQUIRED_ENV_VARS = {
  // Core Supabase (required for most functionality)
  SUPABASE_URL: 'Supabase project URL',
  SUPABASE_SERVICE_ROLE_KEY: 'Supabase service role key (server only)',
  SUPABASE_ANON_KEY: 'Supabase anon key (public)',
  
  // Optional but recommended
  ADMIN_KEY: 'Admin key for protected endpoints',
  
  // Payment (one of these sets should be configured)
  POLAR_CHECKOUT_URL: 'Polar checkout URL (if using Polar payments)',
  POLAR_WEBHOOK_SECRET: 'Polar webhook secret (if using Polar payments)',
  STRIPE_PAYMENT_LINK: 'Stripe payment link (if using Stripe payments)',
  STRIPE_WEBHOOK_SECRET: 'Stripe webhook secret (if using Stripe payments)',
  
  // External APIs
  YOUTUBE_API_KEY: 'YouTube Data API key (for video ingestion)',
  ANTHROPIC_API_KEY: 'Anthropic API key (for post decoding)',
  MCP_TOKEN: 'MCP auth token (if restricting MCP access)',
};

function validateEnvironment() {
  const missing = [];
  const warnings = [];
  
  // Check core required variables
  for (const [key, description] of Object.entries(REQUIRED_ENV_VARS)) {
    if (!process.env[key]) {
      missing.push({ key, description });
    }
  }
  
  // Check payment configuration (at least one provider should be configured)
  const hasPolar = process.env.POLAR_CHECKOUT_URL && process.env.POLAR_WEBHOOK_SECRET;
  const hasStripe = process.env.STRIPE_PAYMENT_LINK && process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!hasPolar && !hasStripe) {
    warnings.push({
      group: 'payments',
      message: 'No payment provider configured. Add POLAR_* or STRIPE_* environment variables for checkout functionality.'
    });
  }
  
  // Check partial configurations
  if (process.env.POLAR_CHECKOUT_URL && !process.env.POLAR_WEBHOOK_SECRET) {
    warnings.push({
      group: 'payments',
      message: 'POLAR_CHECKOUT_URL is set but POLAR_WEBHOOK_SECRET is missing. Webhooks will not work.'
    });
  }
  
  if (process.env.POLAR_WEBHOOK_SECRET && !process.env.POLAR_CHECKOUT_URL) {
    warnings.push({
      group: 'payments',
      message: 'POLAR_WEBHOOK_SECRET is set but POLAR_CHECKOUT_URL is missing. Checkout will not work.'
    });
  }
  
  if (process.env.STRIPE_PAYMENT_LINK && !process.env.STRIPE_WEBHOOK_SECRET) {
    warnings.push({
      group: 'payments',
      message: 'STRIPE_PAYMENT_LINK is set but STRIPE_WEBHOOK_SECRET is missing. Webhooks will not work.'
    });
  }
  
  if (process.env.STRIPE_WEBHOOK_SECRET && !process.env.STRIPE_PAYMENT_LINK) {
    warnings.push({
      group: 'payments',
      message: 'STRIPE_WEBHOOK_SECRET is set but STRIPE_PAYMENT_LINK is missing. Checkout will not work.'
    });
  }
  
  return { missing, warnings };
}

function logEnvironmentStatus() {
  const { missing, warnings } = validateEnvironment();
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(({ key, description }) => {
      console.error(`   ${key}: ${description}`);
    });
    console.error('');
    console.error('Please add these variables to your Vercel environment variables.');
  }
  
  if (warnings.length > 0) {
    console.warn('⚠️  Environment configuration warnings:');
    warnings.forEach(({ group, message }) => {
      console.warn(`   [${group}] ${message}`);
    });
    console.warn('');
  }
  
  if (missing.length === 0 && warnings.length === 0) {
    console.log('✅ Environment variables are properly configured.');
  }
  
  return { 
    isValid: missing.length === 0, 
    hasWarnings: warnings.length > 0,
    missing,
    warnings 
  };
}

export { validateEnvironment, logEnvironmentStatus };
