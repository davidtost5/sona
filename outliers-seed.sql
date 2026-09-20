-- Manual outlier curation (free, honest — no scraping API needed).
-- Run this in Supabase SQL Editor AFTER the `outliers` table exists (it's in schema.sql).
--
-- The Discover feed reads from this table the moment it has rows. With zero rows,
-- /app falls back to the 8 built-in seed posts. Re-run / add rows any time
-- (it's an upsert on id) — bump `position` to control order (lower = first).
--
-- How to curate (≈15 min, weekly): open X/LinkedIn/Substack/YouTube, find posts
-- that clearly outperformed the creator's baseline, and paste the real numbers.
-- `cat` is the Discover filter: 'founders' | 'writers' | 'creators'.
--
-- The last two rows need migration-outliers-substack.sql (read_time, comments,
-- publication, posted_at, and media_type = 'note'). Run it first, or drop those
-- columns from this insert.

insert into outliers (
  id, cat, creator_name, handle, avatar_handle, text, outlier_tag, views, source_url,
  media_type, likes, reposts, comments, read_time, publication, posted_at, position
) values
  ('o_hormozi_1', 'founders', 'Alex Hormozi', '@AlexHormozi · X', 'AlexHormozi',
   'Most founders post too much — not too little. The ones who break out pick one contrarian take and stick to it.',
   '12× outlier', '1.2M views', 'https://x.com/AlexHormozi',
   null, null, null, null, null, null, null, 1),

  ('o_koe_1', 'writers', 'Dan Koe', '@thedankoe · X', 'thedankoe',
   'Three questions I ask before writing anything. They''ve saved me hundreds of bad drafts.',
   '18× outlier', '2.4M views', 'https://x.com/thedankoe',
   null, null, null, null, null, null, null, 2),

  -- Substack, both shapes. Same posts and numbers as the homepage feed; the
  -- daily ingest refreshes this kind of row on its own.
  ('note_thedankoe_319246856', 'writers', 'DAN KOE', '@thedankoe · Substack', 'thedankoe',
   'The fastest way to become articulate on a topic is to write until you''re no longer confused.',
   '6.2× outlier', '13K likes', 'https://substack.com/@thedankoe/note/c-319246856',
   'note', '13K', '919', '231', null, 'future/proof', '2026-08-22T13:15:00Z', 3),

  ('sub_garyvee_the_new_rules_of_social_media_2026', 'writers', 'Gary Vaynerchuk', '@garyvee · Substack', 'garyvee',
   'The New Rules of Social Media (2026) — Brand is the only defensible asset left. Here''s how to build it',
   '10.5× outlier', '684 reactions', 'https://garyvee.substack.com/p/the-new-rules-of-social-media-2026',
   null, '684', '90', '67', '7 min read', 'Underpriced Actions', '2026-07-02T16:46:18Z', 4)
on conflict (id) do update set
  cat = excluded.cat,
  creator_name = excluded.creator_name,
  handle = excluded.handle,
  avatar_handle = excluded.avatar_handle,
  text = excluded.text,
  outlier_tag = excluded.outlier_tag,
  views = excluded.views,
  source_url = excluded.source_url,
  media_type = excluded.media_type,
  likes = excluded.likes,
  reposts = excluded.reposts,
  comments = excluded.comments,
  read_time = excluded.read_time,
  publication = excluded.publication,
  posted_at = excluded.posted_at,
  position = excluded.position;
