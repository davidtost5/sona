-- Billing: one row per Polar subscription, written only by api/polar-webhook.js.
--
-- Run once in Supabase → SQL Editor. Safe to re-run, and safe if the earlier
-- Stripe version of this migration was already run (it renames those columns).
--
-- A customer has paid access while status is 'active' or 'trialing'.
-- cancel_at_period_end = true means they cancelled but keep access until
-- current_period_end; Polar then sends status 'canceled'.

create table if not exists subscriptions (
  polar_subscription_id text primary key,
  polar_customer_id text,
  email text,
  status text,               -- active | trialing | past_due | unpaid | canceled | paused | ...
  plan text,                 -- creator | pro (null if the product is not on the current ladder)
  billing_interval text,     -- month | year
  polar_product_id text,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'subscriptions' and column_name = 'stripe_subscription_id') then
    alter table subscriptions rename column stripe_subscription_id to polar_subscription_id;
    alter table subscriptions rename column stripe_customer_id to polar_customer_id;
    alter table subscriptions rename column stripe_price_id to polar_product_id;
  end if;
end $$;

drop index if exists subscriptions_customer_idx;
create index if not exists subscriptions_email_idx on subscriptions (lower(email));
create index if not exists subscriptions_customer_idx on subscriptions (polar_customer_id);

-- No RLS policies: only the service role (the webhook) touches this table.
alter table subscriptions enable row level security;
