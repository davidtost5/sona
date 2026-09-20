-- Migration: Substack articles and notes in Discover
-- Run once in Supabase → SQL Editor. Safe to re-run (every statement is
-- idempotent) and safe on a live feed: it only ADDS nullable columns and widens
-- one constraint, so existing rows keep rendering exactly as they do today.
--
-- Until this runs, /api/ingest still writes — it drops these five fields and
-- stores notes as plain text cards rather than failing the whole batch — and
-- says so in its response. Running it turns the full cards back on.

alter table outliers add column if not exists comments    text;         -- '67' replies, as captured
alter table outliers add column if not exists read_time   text;         -- '7 min read' (Substack articles)
alter table outliers add column if not exists avatar_url  text;         -- real author photo, when the source has one
alter table outliers add column if not exists publication text;         -- 'Underpriced Actions' — the publication, not the writer
alter table outliers add column if not exists posted_at   timestamptz;  -- when the post went out, not when we captured it

-- 'note' joins the list. A Substack note has no cover image and no title: the
-- text is the whole post, so the card renders it as a quote rather than as an
-- article with something missing.
alter table outliers drop constraint if exists outliers_media_type_check;
alter table outliers add  constraint outliers_media_type_check
  check (media_type is null or media_type in ('image', 'video', 'note'));

-- Sorting a feed by when things were published is the obvious next query.
create index if not exists outliers_posted_at_idx on outliers (posted_at desc);

-- PostgREST caches the schema. Without this, the first write after the
-- migration can still fail with PGRST204 ("column not found") even though the
-- column exists — the same failure mode the waitlist.source column hit.
notify pgrst, 'reload schema';
