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

insert into outliers (id, cat, creator_name, handle, avatar_handle, text, outlier_tag, views, source_url, position) values
  ('o_hormozi_1', 'founders', 'Alex Hormozi', '@AlexHormozi · X', 'AlexHormozi',
   'Most founders post too much — not too little. The ones who break out pick one contrarian take and stick to it.',
   '12× outlier', '1.2M views', 'https://x.com/AlexHormozi', 1),

  ('o_koe_1', 'writers', 'Dan Koe', '@thedankoe · X', 'thedankoe',
   'Three questions I ask before writing anything. They''ve saved me hundreds of bad drafts.',
   '18× outlier', '2.4M views', 'https://x.com/thedankoe', 2)
  -- , ('o_yourpick_1', 'creators', 'Name', '@handle · X', 'handle', 'Post text…', 'N× outlier', 'NNNk views', 'url', 3)
on conflict (id) do update set
  cat = excluded.cat,
  creator_name = excluded.creator_name,
  handle = excluded.handle,
  avatar_handle = excluded.avatar_handle,
  text = excluded.text,
  outlier_tag = excluded.outlier_tag,
  views = excluded.views,
  source_url = excluded.source_url,
  position = excluded.position;
