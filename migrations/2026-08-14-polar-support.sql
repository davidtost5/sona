-- Polar.so payment support migration.
-- Adds columns to `founding_members` for Polar purchases and subscriptions. Safe to re-run.
--
-- Run in Supabase → SQL Editor if `founding_members` table was created prior to Polar setup.

alter table public.founding_members add column if not exists payment_provider text default 'stripe';
alter table public.founding_members add column if not exists polar_customer_id text;
alter table public.founding_members add column if not exists polar_order_id text unique;
alter table public.founding_members add column if not exists polar_checkout_id text;
alter table public.founding_members add column if not exists polar_subscription_id text;
