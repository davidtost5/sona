-- Video outliers in the Discover feed.
-- Adds the columns /api/youtube writes. Safe to re-run.
--
-- Run in Supabase → SQL Editor before deploying, or right after — /api/outliers
-- falls back to its old behaviour until these columns exist.

alter table public.outliers add column if not exists media_type    text not null default 'post';
alter table public.outliers add column if not exists video_id      text;
alter table public.outliers add column if not exists thumbnail_url text;
alter table public.outliers add column if not exists published_at  timestamptz;

-- Only two kinds of row today; the check keeps a typo from creating a third.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'outliers_media_type_check'
  ) then
    alter table public.outliers
      add constraint outliers_media_type_check
      check (media_type in ('post', 'video'));
  end if;
end $$;

-- The feed filters on media_type, and /api/youtube deletes by it on replace.
create index if not exists outliers_media_type_idx on public.outliers (media_type);
