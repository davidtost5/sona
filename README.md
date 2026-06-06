<p align="center">
  <img src="public/logo.svg" width="92" alt="Sona logo">
</p>

<h1 align="center">Sona</h1>

<p align="center">
  Find proven ideas. Write them in your voice.
</p>

<p align="center">
  <em>The creator studio that surfaces what's working and turns it into original content that sounds like you — not a robot.</em>
</p>

---

## What's in this repo

| | |
|---|---|
| 🌐 **Marketing site** | `public/index.html` — hero with trust microbar, persona cards, interactive product preview, format showcase, proof section, founding-member offer, FAQ, big-wordmark footer |
| 📞 **Contact page** | `public/contact.html` — Supabase-backed form |
| 🎛️ **Studio app** | `public/app.html` — authenticated dashboard with real CRUD on `saved_ideas` (RLS-secured) |
| 🔐 **Auth modal** | `public/auth.js` — signup, signin, and early-access waitlist |
| ⚙️ **Serverless APIs** | `api/*.js` — waitlist, contact, checkout (Stripe Payment Link), auth-config, founding-count |
| 🗄️ **Database schema** | `schema.sql` — Supabase tables + Row-Level-Security policies |
| 🚀 **Deploy** | Vercel (`vercel.json`) — auto-routes for serverless functions + clean URLs |

## Stack

- **Frontend** — Vanilla HTML/CSS/JS, no framework, Geist + Geist Mono via Google Fonts
- **Backend** — Supabase (Postgres + Auth + RLS)
- **Hosting** — Vercel (static + serverless functions on Node.js)
- **Payments** — Stripe Payment Links → `/api/checkout` redirect
- **Theme** — Clock-based auto switching (7am–7pm light, else dark) — no manual toggle

## Setup

### 1. Clone & install (no dependencies required)

```bash
git clone https://github.com/davidtost5/sona.git
cd sona
```

The marketing site is fully static — open `public/index.html` in a browser to preview. The serverless functions and auth need the steps below to work end-to-end.

### 2. Provision Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. **Authentication → Sign In / Providers → Email** → toggle off *Confirm email* (so signup → app is instant)
3. **SQL Editor → New query** → paste `schema.sql` → Run

### 3. Set environment variables in Vercel

Vercel → your project → **Settings → Environment Variables** → add:

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase → Settings → Data API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Settings → Data API → `anon · public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → Data API → `service_role · secret` (server-only) |
| `STRIPE_PAYMENT_LINK` | Stripe → Products → create $99/yr founding-member product → Create Payment Link → copy URL |

### 4. Deploy

```bash
vercel --prod
```

Visit your domain. Sign up → land in `/app`. Click Save on any Discover card → check Supabase → there's a row tied to your user.

## Folder structure

```
.
├── api/                     # Vercel serverless functions
│   ├── _supabase.js         # shared admin client (server-only)
│   ├── auth-config.js       # public Supabase config for the browser
│   ├── checkout.js          # Stripe Payment Link redirect
│   ├── contact.js           # contact-form persistence
│   ├── founding-count.js    # real seat counter (returns 0 until first sale)
│   └── waitlist.js          # waitlist persistence
├── public/                  # Vercel output dir (static site)
│   ├── index.html           # marketing site
│   ├── app.html             # authenticated studio
│   ├── contact.html         # contact page
│   ├── auth.js              # client-side Supabase auth modal
│   ├── data.js              # form → API plumbing
│   └── logo.svg             # brand mark (also referenced as favicon)
├── schema.sql               # one-time Supabase setup
├── vercel.json              # routes + headers
└── README.md
```

## Brand

Built by [**David Tost**](https://www.linkedin.com/in/davidtost/), Founder of Sona.

Logo: dark squircle, S-wave mark, indigo sparkle. The "S" is the brand letter and the wave is the *sona* (sound) it represents.
