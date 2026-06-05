-- Sona — Supabase schema
-- Run this in your Supabase SQL Editor once, then auth + the /app dashboard work end-to-end.

-- (Existing tables you should already have)
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  name text, email text unique not null, company text,
  created_at timestamptz default now()
);
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null, email text not null, company text,
  subject text, message text not null,
  created_at timestamptz default now()
);

-- ─── NEW: per-user saved ideas (powers /app Discover ↔ Saved) ───
create table if not exists saved_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id text not null,            -- references SEED_IDEAS in app.html (later: real id)
  created_at timestamptz default now(),
  unique (user_id, idea_id)
);

-- Row-Level-Security so each user only sees their own saves
alter table saved_ideas enable row level security;

create policy "users see their own saves"
  on saved_ideas for select
  using (auth.uid() = user_id);

create policy "users insert their own saves"
  on saved_ideas for insert
  with check (auth.uid() = user_id);

create policy "users delete their own saves"
  on saved_ideas for delete
  using (auth.uid() = user_id);

-- ─── (Optional) profiles table for future use ───
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "users read own profile" on profiles for select using (auth.uid() = id);
create policy "users update own profile" on profiles for update using (auth.uid() = id);
create policy "users insert own profile" on profiles for insert with check (auth.uid() = id);
