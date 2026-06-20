-- Sona — Supabase schema
-- Idempotent: safe to re-run in Supabase SQL Editor.

-- ─── Public forms (server-side via service role) ───
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique not null,
  company text,
  created_at timestamptz default now()
);

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
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id text not null,
  created_at timestamptz default now(),
  unique (user_id, idea_id)
);

alter table saved_ideas enable row level security;

drop policy if exists "users see their own saves" on saved_ideas;
create policy "users see their own saves"
  on saved_ideas for select
  using (auth.uid() = user_id);

drop policy if exists "users insert their own saves" on saved_ideas;
create policy "users insert their own saves"
  on saved_ideas for insert
  with check (auth.uid() = user_id);

drop policy if exists "users delete their own saves" on saved_ideas;
create policy "users delete their own saves"
  on saved_ideas for delete
  using (auth.uid() = user_id);

-- ─── Profiles (auto-created on signup) ───
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  style_guide jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Add style_guide to pre-existing profiles tables (idempotent)
alter table profiles add column if not exists style_guide jsonb default '{}'::jsonb;

alter table profiles enable row level security;

drop policy if exists "users read own profile" on profiles;
create policy "users read own profile"
  on profiles for select
  using (auth.uid() = id);

drop policy if exists "users update own profile" on profiles;
create policy "users update own profile"
  on profiles for update
  using (auth.uid() = id);

drop policy if exists "users insert own profile" on profiles;
create policy "users insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

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
  user_id uuid not null references auth.users(id) on delete cascade,
  title text default '',
  body text default '',
  platform text default 'X',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists drafts_user_updated_idx
  on drafts (user_id, updated_at desc);

alter table drafts enable row level security;

drop policy if exists "users see own drafts" on drafts;
create policy "users see own drafts"
  on drafts for select using (auth.uid() = user_id);

drop policy if exists "users insert own drafts" on drafts;
create policy "users insert own drafts"
  on drafts for insert with check (auth.uid() = user_id);

drop policy if exists "users update own drafts" on drafts;
create policy "users update own drafts"
  on drafts for update using (auth.uid() = user_id);

drop policy if exists "users delete own drafts" on drafts;
create policy "users delete own drafts"
  on drafts for delete using (auth.uid() = user_id);

-- ─── Lists + creators (Lists view in /app) ───
create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled list',
  created_at timestamptz default now()
);

create index if not exists lists_user_created_idx on lists (user_id, created_at);

alter table lists enable row level security;
drop policy if exists "users see own lists" on lists;
create policy "users see own lists" on lists for select using (auth.uid() = user_id);
drop policy if exists "users insert own lists" on lists;
create policy "users insert own lists" on lists for insert with check (auth.uid() = user_id);
drop policy if exists "users update own lists" on lists;
create policy "users update own lists" on lists for update using (auth.uid() = user_id);
drop policy if exists "users delete own lists" on lists;
create policy "users delete own lists" on lists for delete using (auth.uid() = user_id);

-- Custom creators a user pasted in (outside the built-in directory)
create table if not exists custom_creators (
  id text primary key,                 -- e.g. cc_handle_abc123
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  handle text,
  platform text,
  av text,
  created_at timestamptz default now()
);

alter table custom_creators enable row level security;
drop policy if exists "users see own custom creators" on custom_creators;
create policy "users see own custom creators" on custom_creators for select using (auth.uid() = user_id);
drop policy if exists "users insert own custom creators" on custom_creators;
create policy "users insert own custom creators" on custom_creators for insert with check (auth.uid() = user_id);
drop policy if exists "users delete own custom creators" on custom_creators;
create policy "users delete own custom creators" on custom_creators for delete using (auth.uid() = user_id);

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
  using (exists (select 1 from lists l where l.id = list_id and l.user_id = auth.uid()));
drop policy if exists "users insert own list_creators" on list_creators;
create policy "users insert own list_creators" on list_creators for insert
  with check (exists (select 1 from lists l where l.id = list_id and l.user_id = auth.uid()));
drop policy if exists "users delete own list_creators" on list_creators;
create policy "users delete own list_creators" on list_creators for delete
  using (exists (select 1 from lists l where l.id = list_id and l.user_id = auth.uid()));

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
