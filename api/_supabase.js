// Shared Supabase client for serverless functions (server-side).
// Fill these in (or set them as Vercel env vars) when you go live.
//
// In the Vercel dashboard → Project → Settings → Environment Variables, add:
//   SUPABASE_URL              = https://xxxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = (the service_role secret key — server only, never the anon key)
//
// Then run two SQL statements in Supabase (SQL Editor):
//
//   create table waitlist (
//     id uuid primary key default gen_random_uuid(),
//     name text, email text unique not null, company text,
//     created_at timestamptz default now()
//   );
//   create table contacts (
//     id uuid primary key default gen_random_uuid(),
//     name text not null, email text not null, company text,
//     subject text, message text not null,
//     created_at timestamptz default now()
//   );

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = (url && key) ? createClient(url, key) : null;
