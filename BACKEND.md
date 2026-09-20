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

   Optional — welcome emails on signup. Pick **one** transport; SMTP wins if both
   are set. Without either, signups still work and the email is simply skipped.
   ```
   # Option A — Spacemail (or any mailbox host) over SMTP
   SMTP_HOST  = mail.spacemail.com
   SMTP_PORT  = 465                          # 465 = SSL, 587 = STARTTLS
   SMTP_USER  = hello@buildwithsona.com
   SMTP_PASS  = <mailbox password>
   EMAIL_FROM = Sona <hello@buildwithsona.com>

   # Option B — Resend (transactional API)
   RESEND_API_KEY = re_...
   EMAIL_FROM     = Sona <hello@buildwithsona.com>
   ```
   `EMAIL_FROM` must be on a domain you're allowed to send as, or mail will be
   rejected or land in spam.

4. **Flip the switch.** In `public/data.js`, change:
   ```js
   const MODE = 'mock';   →   const MODE = 'api';
   ```

5. **Deploy:** `npx vercel --prod --yes`

Now `/api/waitlist` and `/api/contact` write to Postgres. The forms and validation
don't change — they already call `CanopyData`.

## Scheduled jobs, and keeping the database awake

`vercel.json` defines two daily crons:

| Cron | What it does |
|------|--------------|
| `/api/ingest` at 06:00 UTC | Pulls fresh outliers into the `outliers` table from YouTube RSS, Substack archives, and Substack notes. |
| `/api/health` at 18:00 UTC | One cheap read, plus a status report. Exists so the database is never idle for a week. |

The ingest reads three public sources, none of which needs a key or has a quota.
Each post is scored against its own author's median — YouTube on views, Substack
articles and notes on likes, notes against other notes — so the multiple means
something regardless of audience size.

| Env | Default | What it lists |
|-----|---------|---------------|
| `INGEST_HANDLES` | 15 channels | YouTube handles or channel ids. |
| `INGEST_SUBSTACKS` | 10 publications | Publication subdomains (`garyvee` → `garyvee.substack.com`). |
| `INGEST_SUBSTACK_NOTES` | 6 writers | Substack **user** handles, which are not always the publication subdomain. A writer needs at least six recent notes, or there is no baseline to score against. |

Run **`migration-outliers-substack.sql`** once for the columns the Substack rows
use (`read_time`, `comments`, `publication`, `avatar_url`, `posted_at`, and
`media_type = 'note'`). Until it runs the ingest still writes: it drops those
fields, stores notes as plain text cards, and says so in its response
(`degraded: …`) rather than failing the batch and losing the YouTube rows too.

**`CRON_SECRET` is required, not optional.** Vercel only sends an
`Authorization: Bearer <CRON_SECRET>` header once you have created that variable
yourself — it is not generated for you. Without it the scheduled ingest cannot
prove it is Vercel calling, so it refuses to write:

```
CRON_SECRET = <random string, 16+ chars: openssl rand -hex 32>
```

Set it in Project → Settings → Environment Variables (Production) and redeploy.
Until it is set, the ingest cron answers 500 with the reason, which is deliberate:
it used to answer 200 and silently write nothing, so a misconfigured job looked
like a healthy one while the Discover feed quietly went stale for weeks.

**Why the health cron matters.** A free Supabase project is paused after about a
week with no activity, and Supabase emails a warning first. The marketing site
serves static HTML and never touches Postgres, so a quiet week is enough to get
the project suspended even though nothing is broken. `/api/health` queries the
database once a day, which keeps that clock reset, and reports what it found:

```bash
curl https://buildwithsona.com/api/health
# → { ok: true,
#     database: { reachable: true, outliers: 88, ingestedOutliers: 84,
#                 lastIngestAgeHours: 11, ingestStale: false },
#     config:   { database: true, cronSecret: true, adminKey: true } }
```

`ingestStale: true` means the daily ingest has not landed anything for over two
days — check `config.cronSecret` first. A `503` means the database is unreachable
or paused; unpause it from the Supabase dashboard within 90 days.

Note that a Vercel Hobby project allows **two** cron jobs, once per day each, so
these two fill the quota. A paid Supabase plan removes the pausing behaviour
altogether and makes the health cron a monitor rather than a necessity.

## Resolving a link somebody sends you

`/api/resolve` is the other direction from the cron: instead of watching a fixed
list of creators, it takes one link and fetches the post behind it. No key, no
write — resolving is a read.

```bash
curl 'https://buildwithsona.com/api/resolve?url=https://youtu.be/8-q3ClOYoyA'
# → { ok: true, source: 'youtube',
#     row: { creator_name: 'Eden', text: 'My Entire Social Media Strategy…',
#            views: '44K views', outlier_tag: '1.8× outlier', likes: '1.6K',
#            source_url: 'https://www.youtube.com/watch?v=8-q3ClOYoyA', … } }
```

| Link | Where the numbers come from |
|------|----------------------------|
| YouTube video | oEmbed for the title and channel, the channel's RSS feed for views and the median. |
| Substack post (`/p/<slug>`) | `/api/v1/posts/<slug>` on the publication's own host, plus its archive for the median. Custom domains work. |
| Substack note (`/@handle/note/c-<id>`) | `/api/v1/reader/comment/<id>`, plus that writer's note feed for the median. |

The answer is a row in exactly the shape the `outliers` table uses, so `/app`
drops it straight into Discover and decodes it. A link with no numbers to score
(an older video that has fallen out of the RSS window) comes back without an
outlier tag rather than with a made-up `1.0×`.

Because the endpoint fetches a URL a stranger chose, it refuses IP literals,
anything that resolves into a private range, and any host reached over plain
HTTP, and it is rate limited per IP.

## Files

| File | Role |
|------|------|
| `public/data.js` | The data layer. The only place `MODE` lives. |
| `public/admin.html` | Lead review dashboard (mock mode reads localStorage). |
| `api/waitlist.js` | Serverless endpoint for signups (used in `api` mode). |
| `api/contact.js` | Serverless endpoint for messages. |
| `api/_supabase.js` | Shared Supabase client + SQL schema docs. |
| `api/ingest.js` | Daily outlier ingest (YouTube RSS + Substack archives + Substack notes). |
| `api/resolve.js` | Turns one pasted link into the real post behind it. |
| `api/health.js` | Status probe and the daily keepalive that stops the database being paused. |

## What's still needed for a *full product app*

This covers lead capture only. A logged-in product would add: configured Supabase
**Auth** (already scaffolded in `auth.js`), a protected `dashboard.html`, and
per-user data tables with Row Level Security. That's the next phase when you're ready.
