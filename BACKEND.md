# Canopy — Backend (Waitlist & CRM)

The site captures two things: **waitlist signups** ("Request access") and **contact
messages**. Everything flows through one file — `public/data.js` — so switching from
the demo backend to a real one is a one-line change.

## How it works now (mock mode)

`data.js` has `MODE = 'mock'`. Forms save to the visitor's **browser** (localStorage).

- "Log in" / "Request access" → opens a waitlist form → saved
- Contact form → saved
- Review everything at **`/admin.html`** — search, export to CSV, clear

⚠️ Mock data lives in *one browser*. A signup on someone else's device won't show up
in your admin page. It's perfect for demoing the flow; not for collecting real leads.

## Going live (real database, all visitors)

1. **Create a free Supabase project** at supabase.com → copy the Project URL and keys.

2. **Create the tables.** In Supabase → SQL Editor, run the two `create table`
   statements documented at the top of `api/_supabase.js`.

3. **Add Vercel env vars** (Project → Settings → Environment Variables):
   ```
   SUPABASE_URL              = https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY = <service_role secret>
   ```

4. **Flip the switch.** In `public/data.js`, change:
   ```js
   const MODE = 'mock';   →   const MODE = 'api';
   ```

5. **Deploy:** `npx vercel --prod --yes`

Now `/api/waitlist` and `/api/contact` write to Postgres. The forms and validation
don't change — they already call `CanopyData`.

## Files

| File | Role |
|------|------|
| `public/data.js` | The data layer. The only place `MODE` lives. |
| `public/admin.html` | Lead review dashboard (mock mode reads localStorage). |
| `api/waitlist.js` | Serverless endpoint for signups (used in `api` mode). |
| `api/contact.js` | Serverless endpoint for messages. |
| `api/_supabase.js` | Shared Supabase client + SQL schema docs. |

## What's still needed for a *full product app*

This covers lead capture only. A logged-in product would add: configured Supabase
**Auth** (already scaffolded in `auth.js`), a protected `dashboard.html`, and
per-user data tables with Row Level Security. That's the next phase when you're ready.
