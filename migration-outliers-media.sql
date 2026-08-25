-- Migration: media-rich Discover cards
-- Run once in Supabase → SQL Editor. Safe to re-run (every statement is
-- idempotent) and safe on a live feed: it only ADDS nullable columns, so
-- existing rows keep rendering as text cards exactly as they do today.

alter table outliers add column if not exists media_type text;  -- null | 'image' | 'video'
alter table outliers add column if not exists thumb_url  text;  -- preview image URL
alter table outliers add column if not exists duration   text;  -- '10:38' (video only)
alter table outliers add column if not exists likes      text;  -- '12K' — as captured
alter table outliers add column if not exists reposts    text;  -- '480'

-- Only 'image' or 'video' should ever reach the client. The API already
-- whitelists this, but the constraint means a bad direct INSERT can't slip
-- a value through that the card renderer won't understand.
alter table outliers drop constraint if exists outliers_media_type_check;
alter table outliers add  constraint outliers_media_type_check
  check (media_type is null or media_type in ('image', 'video'));

-- PostgREST caches the schema. Without this, the first publish from /admin can
-- fail with PGRST204 ("column not found") even though the column exists —
-- the same failure mode the waitlist.source column hit.
notify pgrst, 'reload schema';
