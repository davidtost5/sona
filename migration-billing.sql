-- Billing: one row per Stripe subscription, written only by api/stripe-webhook.js.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- `email` comes from checkout.session.completed; everything else from the
-- customer.subscription.* events, which may arrive first. Either event can
-- create the row, and each fills in only its own columns.
--
-- A customer has paid access while status is 'active' or 'trialing'.
-- cancel_at_period_end = true means they cancelled but keep access until
-- current_period_end; Stripe then sends status 'canceled'.

create table if not exists subscriptions (
  stripe_subscription_id text primary key,
  stripe_customer_id text,
  email text,
  status text,               -- active | trialing | past_due | unpaid | canceled | incomplete | ...
  plan text,                 -- creator | pro (null if the price is not on the current ladder)
  billing_interval text,     -- month | year
  stripe_price_id text,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_email_idx on subscriptions (lower(email));
create index if not exists subscriptions_customer_idx on subscriptions (stripe_customer_id);

-- No RLS policies: only the service role (the webhook) touches this table.
alter table subscriptions enable row level security;
