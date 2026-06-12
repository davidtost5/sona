// Shared Supabase client for serverless functions (server-side).
//
// Vercel → Project → Settings → Environment Variables:
//   SUPABASE_URL              = https://xxxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = service_role secret (server only, never the anon key)
//
// Run schema.sql once in Supabase SQL Editor. Tables:
//   waitlist, contacts          — public forms (service role, no RLS)
//   saved_ideas                 — /app saved ideas (RLS per user)
//   profiles                    — auto-created on signup (RLS per user)
//   founding_members            — Stripe webhook seat counter (service role only)

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = (url && key) ? createClient(url, key) : null;
