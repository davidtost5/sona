-- ═══════════════════════════════════════════════════════════════════════════
-- Sona — migrate row-level security from Supabase Auth to Clerk
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS EXISTS
-- Supabase Auth mints a JWT whose subject is a uuid, which is why every
-- user_id column is `uuid references auth.users(id)` and every policy reads
-- `auth.uid()`. Clerk mints its own JWT whose subject is a string like
-- `user_2abc…`. Against a Clerk token `auth.uid()` returns NULL, so without
-- this migration every authenticated read silently returns zero rows — the app
-- looks empty rather than broken, which is the worst possible failure mode.
--
-- WHAT IT DOES
--   1. Retypes 5 user_id columns from uuid to text
--   2. Drops the 5 foreign keys to auth.users (Clerk ids do not live there)
--   3. Rewrites all 20 policies from auth.uid() to auth.jwt()->>'sub'
--
-- WHAT YOU LOSE
-- The `on delete cascade` to auth.users. Deleting a Clerk user will no longer
-- clean up their Supabase rows automatically. api/clerk-webhook.js replaces
-- that — deploy it, or account deletion silently leaves orphaned data and your
-- privacy policy's "ask us to delete it" promise stops being true.
--
-- BEFORE YOU RUN THIS
-- Section 0 counts existing rows. If it returns anything above zero, STOP:
-- those rows carry Supabase uuids that no Clerk user maps to, and this
-- migration will orphan them. You would need a uuid→Clerk-id mapping first.
-- At last check founding_members.claimed was 0, so this is very likely a
-- no-data migration — but confirm rather than assume.
--
-- Run in: Supabase Dashboard → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 0. PRE-FLIGHT — run this block ON ITS OWN first ───────────────────────
-- Every count must be 0 before you run the rest of this file.

select 'saved_ideas'     as table_name, count(*) as rows_at_risk from saved_ideas
union all select 'profiles',        count(*) from profiles
union all select 'drafts',          count(*) from drafts
union all select 'lists',           count(*) from lists
union all select 'custom_creators', count(*) from custom_creators
union all select 'list_creators',   count(*) from list_creators
union all select 'auth.users',      count(*) from auth.users
order by table_name;

-- ── If any count above is > 0, stop here and map the ids first. ──


-- ─── 1. MIGRATION ──────────────────────────────────────────────────────────
-- Everything below runs as one transaction: it either all applies or none of
-- it does, so a failure halfway cannot leave RLS half-rewritten and the tables
-- readable by the wrong people.

begin;

-- ── 1a. Drop the policies that reference the columns being retyped ──
-- Postgres will not alter a column type while a policy depends on it.

drop policy if exists "users see their own saves"        on saved_ideas;
drop policy if exists "users insert their own saves"     on saved_ideas;
drop policy if exists "users delete their own saves"     on saved_ideas;

drop policy if exists "users read own profile"           on profiles;
drop policy if exists "users update own profile"         on profiles;
drop policy if exists "users insert own profile"         on profiles;

drop policy if exists "users see own drafts"             on drafts;
drop policy if exists "users insert own drafts"          on drafts;
drop policy if exists "users update own drafts"          on drafts;
drop policy if exists "users delete own drafts"          on drafts;

drop policy if exists "users see own lists"              on lists;
drop policy if exists "users insert own lists"           on lists;
drop policy if exists "users update own lists"           on lists;
drop policy if exists "users delete own lists"           on lists;

drop policy if exists "users see own custom creators"    on custom_creators;
drop policy if exists "users insert own custom creators" on custom_creators;
drop policy if exists "users delete own custom creators" on custom_creators;

drop policy if exists "users see own list_creators"      on list_creators;
drop policy if exists "users insert own list_creators"   on list_creators;
drop policy if exists "users delete own list_creators"   on list_creators;


-- ── 1b. Drop the foreign keys to auth.users ──
-- Clerk ids are not rows in auth.users, so these constraints can no longer hold.
-- Constraint names are the Postgres defaults; the DO block tolerates renames.

do $$
declare
  fk record;
begin
  for fk in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_class fref on fref.oid = con.confrelid
    join pg_namespace fns on fns.oid = fref.relnamespace
    where con.contype = 'f'
      and fns.nspname = 'auth'
      and fref.relname = 'users'
      and rel.relname in ('saved_ideas','profiles','drafts','lists','custom_creators')
  loop
    execute format('alter table %I drop constraint %I', fk.relname, fk.conname);
    raise notice 'dropped % on %', fk.conname, fk.relname;
  end loop;
end $$;


-- ── 1c. Retype the id columns from uuid to text ──
-- The USING clause is a formality while the tables are empty, but it makes the
-- statement correct if a stray row exists.

alter table saved_ideas     alter column user_id type text using user_id::text;
alter table profiles        alter column id      type text using id::text;
alter table drafts          alter column user_id type text using user_id::text;
alter table lists           alter column user_id type text using user_id::text;
alter table custom_creators alter column user_id type text using user_id::text;

-- profiles.id defaulted to auth.uid(); there is no server-side default for a
-- Clerk id, so the client supplies it on insert.
alter table profiles alter column id drop default;


-- ── 1d. Recreate every policy against the Clerk subject ──
-- auth.jwt()->>'sub' is the Clerk user id. Supabase must be configured to trust
-- Clerk as a third-party auth provider for this to be populated at all
-- (Dashboard → Authentication → Third-Party Auth → add your Clerk domain).

create policy "users see their own saves"    on saved_ideas for select
  using ((auth.jwt()->>'sub') = user_id);
create policy "users insert their own saves" on saved_ideas for insert
  with check ((auth.jwt()->>'sub') = user_id);
create policy "users delete their own saves" on saved_ideas for delete
  using ((auth.jwt()->>'sub') = user_id);

create policy "users read own profile"   on profiles for select
  using ((auth.jwt()->>'sub') = id);
create policy "users update own profile" on profiles for update
  using ((auth.jwt()->>'sub') = id);
create policy "users insert own profile" on profiles for insert
  with check ((auth.jwt()->>'sub') = id);

create policy "users see own drafts"    on drafts for select
  using ((auth.jwt()->>'sub') = user_id);
create policy "users insert own drafts" on drafts for insert
  with check ((auth.jwt()->>'sub') = user_id);
create policy "users update own drafts" on drafts for update
  using ((auth.jwt()->>'sub') = user_id);
create policy "users delete own drafts" on drafts for delete
  using ((auth.jwt()->>'sub') = user_id);

create policy "users see own lists"    on lists for select
  using ((auth.jwt()->>'sub') = user_id);
create policy "users insert own lists" on lists for insert
  with check ((auth.jwt()->>'sub') = user_id);
create policy "users update own lists" on lists for update
  using ((auth.jwt()->>'sub') = user_id);
create policy "users delete own lists" on lists for delete
  using ((auth.jwt()->>'sub') = user_id);

create policy "users see own custom creators"    on custom_creators for select
  using ((auth.jwt()->>'sub') = user_id);
create policy "users insert own custom creators" on custom_creators for insert
  with check ((auth.jwt()->>'sub') = user_id);
create policy "users delete own custom creators" on custom_creators for delete
  using ((auth.jwt()->>'sub') = user_id);

-- list_creators has no user_id of its own; it scopes through the parent list.
create policy "users see own list_creators" on list_creators for select
  using (exists (select 1 from lists l
                 where l.id = list_id and l.user_id = (auth.jwt()->>'sub')));
create policy "users insert own list_creators" on list_creators for insert
  with check (exists (select 1 from lists l
                      where l.id = list_id and l.user_id = (auth.jwt()->>'sub')));
create policy "users delete own list_creators" on list_creators for delete
  using (exists (select 1 from lists l
                 where l.id = list_id and l.user_id = (auth.jwt()->>'sub')));

commit;


-- ─── 2. VERIFY ─────────────────────────────────────────────────────────────
-- Expect 20 rows, every qualifier mentioning auth.jwt(), none mentioning
-- auth.uid(). Any row still showing auth.uid() is a policy this file missed and
-- a table that will read empty under Clerk.

select tablename,
       policyname,
       coalesce(qual, with_check) as rule
from pg_policies
where schemaname = 'public'
  and tablename in ('saved_ideas','profiles','drafts','lists',
                    'custom_creators','list_creators')
order by tablename, policyname;

-- Confirm the columns are text and the auth.users FKs are gone:
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'profiles' and column_name = 'id')
    or (table_name in ('saved_ideas','drafts','lists','custom_creators')
        and column_name = 'user_id'))
order by table_name;


-- ─── 3. ROLLBACK ───────────────────────────────────────────────────────────
-- Only valid while the tables are empty — text ids cannot become uuids once
-- Clerk has written real rows. If you need to go back after users exist, drop
-- the rows first.
--
--   begin;
--   -- drop the 20 Clerk policies (same names as section 1d)
--   alter table saved_ideas     alter column user_id type uuid using user_id::uuid;
--   alter table profiles        alter column id      type uuid using id::uuid;
--   alter table drafts          alter column user_id type uuid using user_id::uuid;
--   alter table lists           alter column user_id type uuid using user_id::uuid;
--   alter table custom_creators alter column user_id type uuid using user_id::uuid;
--   -- then re-run the policy and FK blocks from schema.sql
--   commit;
