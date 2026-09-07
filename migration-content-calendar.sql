-- ═══════════════════════════════════════════════════════════════════════════
-- Content calendar — extends `drafts` rather than adding a table
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A calendar entry is a draft with a date on it. Modelling them separately
-- would mean a draft and its calendar row could not see each other: you would
-- write a post in Drafts, schedule a different row in the Calendar, and have no
-- way to say they are the same thing. Every entry here is already a draft, so
-- writing and scheduling stay one object.
--
-- `platform` already exists on drafts. This adds the three columns the calendar
-- view needs and nothing else.
--
--   format        Essay | Thread | Post | Video | Newsletter
--   status        Idea | Draft | Review | Scheduled | Published
--   publish_date  the date the piece is meant to go out
--
-- Week number is NOT stored. It is derived from publish_date at render time —
-- storing it would let the two disagree the moment a date moves, and there is
-- no question a stored week can answer that the date cannot.
--
-- Safe to run more than once. Run in: Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table drafts add column if not exists format       text;
alter table drafts add column if not exists status       text default 'Idea';
alter table drafts add column if not exists publish_date date;

-- Constrained rather than free text: the calendar groups and colours by these,
-- and a typo would silently create a new group with one item in it.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drafts_status_check') then
    alter table drafts add constraint drafts_status_check
      check (status is null or status in ('Idea','Draft','Review','Scheduled','Published'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'drafts_format_check') then
    alter table drafts add constraint drafts_format_check
      check (format is null or format in ('Essay','Thread','Post','Video','Newsletter'));
  end if;
end $$;

-- Existing drafts predate the calendar and have no status. They are drafts.
update drafts set status = 'Draft' where status is null;

-- The calendar view reads by user and orders by date; without this it is a
-- sequential scan per render once there are more than a handful of rows.
create index if not exists drafts_user_publish_idx
  on drafts (user_id, publish_date);

commit;


-- ─── Verify ────────────────────────────────────────────────────────────────
-- Expect three rows: format (text), status (text), publish_date (date).

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'drafts'
  and column_name in ('format', 'status', 'publish_date')
order by column_name;

-- And that nothing was left without a status:
select count(*) as drafts_without_status from drafts where status is null;


-- ─── Rollback ──────────────────────────────────────────────────────────────
--   begin;
--   drop index if exists drafts_user_publish_idx;
--   alter table drafts drop constraint if exists drafts_status_check;
--   alter table drafts drop constraint if exists drafts_format_check;
--   alter table drafts drop column if exists format;
--   alter table drafts drop column if exists status;
--   alter table drafts drop column if exists publish_date;
--   commit;
