-- Sona — Supabase schema
-- Idempotent: safe to re-run in Supabase SQL Editor.
--
-- ── Identity lives in Clerk, not in Supabase Auth ──
-- Supabase is the database; Clerk mints the session token. Supabase is
-- configured to trust it as a third-party auth provider, so inside a policy
-- auth.jwt()->>'sub' is the Clerk user id — a string like user_2abc, not a
-- uuid. That is why every user_id column is text and why nothing references
-- auth.users: a Clerk user is not a row in it.
--
-- Two consequences worth knowing before editing this file:
--   auth.uid() returns NULL against a Clerk token. A policy written with it
--   does not error — it silently matches nothing, and the app looks empty.
--
--   Dropping the auth.users foreign keys also dropped their delete cascade.
--   api/clerk-webhook.js replaces it, on Clerk's user.deleted event.
--
-- This file describes the live database. It reached its current shape via
-- migration-clerk-auth.sql and migration-content-calendar.sql; running it
-- fresh produces the same result.

-- ─── Public forms (server-side via service role) ───
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique not null,
  company text,
  source text default 'unknown',   -- footer-newsletter | request-access | contact
  created_at timestamptz default now()
);

-- Migration for databases created before `source` existed. Safe to re-run.
-- Until this is applied, api/waitlist.js drops the field rather than failing.
alter table waitlist add column if not exists source text default 'unknown';

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  subject text,
  message text not null,
  created_at timestamptz default now()
);

-- ─── Per-user saved ideas (/app Discover ↔ Saved) ───
create table if not exists saved_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,   -- Clerk user id (user_2abc…), not a uuid
  idea_id text not null,
  created_at timestamptz default now(),
  unique (user_id, idea_id)
);

alter table saved_ideas enable row level security;

drop policy if exists "users see their own saves" on saved_ideas;
create policy "users see their own saves"
  on saved_ideas for select
  using ((auth.jwt()->>'sub') = user_id);

drop policy if exists "users insert their own saves" on saved_ideas;
create policy "users insert their own saves"
  on saved_ideas for insert
  with check ((auth.jwt()->>'sub') = user_id);

drop policy if exists "users delete their own saves" on saved_ideas;
create policy "users delete their own saves"
  on saved_ideas for delete
  using ((auth.jwt()->>'sub') = user_id);

-- ─── Profiles (auto-created on signup) ───
create table if not exists profiles (
  id text primary key,     -- Clerk user id; matches auth.jwt()->>'sub'
  full_name text,
  style_guide jsonb default '{}'::jsonb,
  workspace jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Add jsonb columns to pre-existing profiles tables (idempotent)
alter table profiles add column if not exists style_guide jsonb default '{}'::jsonb;
alter table profiles add column if not exists workspace jsonb default '{}'::jsonb;

alter table profiles enable row level security;

drop policy if exists "users read own profile" on profiles;
create policy "users read own profile"
  on profiles for select
  using ((auth.jwt()->>'sub') = id);

drop policy if exists "users update own profile" on profiles;
create policy "users update own profile"
  on profiles for update
  using ((auth.jwt()->>'sub') = id);

drop policy if exists "users insert own profile" on profiles;
create policy "users insert own profile"
  on profiles for insert
  with check ((auth.jwt()->>'sub') = id);

-- Auto-create profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Drafts (Studio editor in /app) ───
create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,   -- Clerk user id (user_2abc…), not a uuid
  title text default '',
  body text default '',
  platform text default 'X',
  -- Content calendar. A calendar entry is a draft with a date on it, so these
  -- live here rather than in a table of their own.
  format text,               -- Essay | Thread | Post | Video | Newsletter
  status text default 'Idea',-- Idea | Draft | Review | Scheduled | Published
  publish_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint drafts_status_check check (status is null or status in ('Idea','Draft','Review','Scheduled','Published')),
  constraint drafts_format_check check (format is null or format in ('Essay','Thread','Post','Video','Newsletter'))
);

-- The calendar reads by user and orders by date.
create index if not exists drafts_user_publish_idx on drafts (user_id, publish_date);

create index if not exists drafts_user_updated_idx
  on drafts (user_id, updated_at desc);

alter table drafts enable row level security;

drop policy if exists "users see own drafts" on drafts;
create policy "users see own drafts"
  on drafts for select using ((auth.jwt()->>'sub') = user_id);

drop policy if exists "users insert own drafts" on drafts;
create policy "users insert own drafts"
  on drafts for insert with check ((auth.jwt()->>'sub') = user_id);

drop policy if exists "users update own drafts" on drafts;
create policy "users update own drafts"
  on drafts for update using ((auth.jwt()->>'sub') = user_id);

drop policy if exists "users delete own drafts" on drafts;
create policy "users delete own drafts"
  on drafts for delete using ((auth.jwt()->>'sub') = user_id);

-- ─── Lists + creators (Lists view in /app) ───
create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,   -- Clerk user id (user_2abc…), not a uuid
  name text not null default 'Untitled list',
  created_at timestamptz default now()
);

create index if not exists lists_user_created_idx on lists (user_id, created_at);

alter table lists enable row level security;
drop policy if exists "users see own lists" on lists;
create policy "users see own lists" on lists for select using ((auth.jwt()->>'sub') = user_id);
drop policy if exists "users insert own lists" on lists;
create policy "users insert own lists" on lists for insert with check ((auth.jwt()->>'sub') = user_id);
drop policy if exists "users update own lists" on lists;
create policy "users update own lists" on lists for update using ((auth.jwt()->>'sub') = user_id);
drop policy if exists "users delete own lists" on lists;
create policy "users delete own lists" on lists for delete using ((auth.jwt()->>'sub') = user_id);

-- Custom creators a user pasted in (outside the built-in directory)
create table if not exists custom_creators (
  id text primary key,                 -- e.g. cc_handle_abc123
  user_id text not null,   -- Clerk user id (user_2abc…), not a uuid
  name text,
  handle text,
  platform text,
  av text,
  created_at timestamptz default now()
);

alter table custom_creators enable row level security;
drop policy if exists "users see own custom creators" on custom_creators;
create policy "users see own custom creators" on custom_creators for select using ((auth.jwt()->>'sub') = user_id);
drop policy if exists "users insert own custom creators" on custom_creators;
create policy "users insert own custom creators" on custom_creators for insert with check ((auth.jwt()->>'sub') = user_id);
drop policy if exists "users delete own custom creators" on custom_creators;
create policy "users delete own custom creators" on custom_creators for delete using ((auth.jwt()->>'sub') = user_id);

-- Membership: which creators belong to which list (creator_id = directory id 'c_…' or custom 'cc_…')
create table if not exists list_creators (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  creator_id text not null,
  position int default 0,
  added_at timestamptz default now(),
  unique (list_id, creator_id)
);

create index if not exists list_creators_list_idx on list_creators (list_id, position);

alter table list_creators enable row level security;
-- Scope through the parent list's owner
drop policy if exists "users see own list_creators" on list_creators;
create policy "users see own list_creators" on list_creators for select
  using (exists (select 1 from lists l where l.id = list_id and l.user_id = (auth.jwt()->>'sub')));
drop policy if exists "users insert own list_creators" on list_creators;
create policy "users insert own list_creators" on list_creators for insert
  with check (exists (select 1 from lists l where l.id = list_id and l.user_id = (auth.jwt()->>'sub')));
drop policy if exists "users delete own list_creators" on list_creators;
create policy "users delete own list_creators" on list_creators for delete
  using (exists (select 1 from lists l where l.id = list_id and l.user_id = (auth.jwt()->>'sub')));

-- ─── Outliers (Discover feed) ───
-- The real, curated outlier posts the Discover feed reads from. This is the
-- storage the ingest pipeline writes to. For v1 it's hand-curated (free, honest)
-- — automated scraping (X API / LinkedIn) is deferred until revenue justifies it.
-- Public read (it's a shared catalog, not user data); writes are service-role only.
create table if not exists outliers (
  id text primary key,                 -- stable slug, e.g. 'o_hormozi_contrarian'
  cat text default 'founders',         -- founders | writers | creators (Discover filter)
  creator_name text not null,
  handle text not null,                -- '@AlexHormozi · X'
  avatar_handle text,                  -- bare handle for unavatar.io (e.g. 'AlexHormozi')
  text text not null,
  outlier_tag text,                    -- '12× outlier'
  views text,                          -- '1.2M views'
  source_url text,
  media_type text,                     -- null | 'image' | 'video'  (null = text post)
  thumb_url text,                      -- preview image for image/video posts
  duration text,                       -- '10:38' for video
  likes text,                          -- '101K'  — as captured, not computed
  reposts text,                        -- '17K'
  position int default 0,              -- display order (lower first)
  captured_at timestamptz default now()
);

-- Media columns were added after the table shipped. Safe to re-run; rows
-- without them keep rendering as text cards.
alter table outliers add column if not exists media_type text;
alter table outliers add column if not exists thumb_url text;
alter table outliers add column if not exists duration text;
alter table outliers add column if not exists likes text;
alter table outliers add column if not exists reposts text;

create index if not exists outliers_position_idx on outliers (position, captured_at desc);

alter table outliers enable row level security;
drop policy if exists "anyone can read outliers" on outliers;
create policy "anyone can read outliers" on outliers for select using (true);
-- No insert/update/delete policies: only the service role curates this table.

-- ─── Outlier decode cache (/api/decode → Claude Haiku) ───
-- Keyed by sha256 of the post text so the SAME post is paid for once across all users.
-- Service-role only (the API writes through it); no RLS policies needed since the anon
-- client never touches this table directly.
create table if not exists post_decodes (
  id text primary key,                 -- sha256(post text)
  decoded jsonb not null,              -- { hook, tension, payoff, pattern, why, apply }
  model text,
  created_at timestamptz default now()
);

alter table post_decodes enable row level security;
-- No policies: only the service role (api/decode.js) reads/writes this table.

-- ─── Founding members (Stripe webhook → /api/founding-count) ───
create table if not exists founding_members (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  stripe_customer_id text,
  stripe_session_id text unique,
  amount_cents integer,
  created_at timestamptz default now()
);

create index if not exists founding_members_created_at_idx
  on founding_members (created_at desc);

-- No RLS policies: only service role (webhook + founding-count API) should touch this table.
alter table founding_members enable row level security;
