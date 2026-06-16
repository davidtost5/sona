# Sona — Linear import (staged 2026-06-10)

> Staged locally because the Linear MCP connection was down.
> Push these as issues when reconnected. ✅ = Done, ⬜ = Backlog.

## Project: Sona — Launch

### ✅ Done (log for the record)

1. **Marketing site v1** — hero + trust microbar, personas, bento grid, interactive studio preview (Discover/Studio/Voice/Calendar tabs), formats showcase, proof section, founding offer, FAQ, big-wordmark footer.
2. **Auth + /app studio** — Supabase auth (signup/signin/waitlist modal), authenticated dashboard, saved ideas with RLS (`saved_ideas` table), sign-out.
3. **Forms → Supabase** — waitlist (`/api/waitlist`) with queue-position success card + invite link; contact form (`/api/contact`).
4. **Founding member offer** — $99/yr lifetime, 100 seats, real seat counter (`/api/founding-count`, returns honest 0), Stripe checkout endpoint (`/api/checkout`), in-app sidebar upsell (dismissible).
5. **Clock-based auto theme** — 7am–7pm light, else dark; no toggle; minute-interval live flip; no-flash head bootstrap.
6. **Mobile optimization** — safe-area insets, stacked CTAs, 16px inputs (no iOS zoom), horizontal pill nav in /app, touch hover resets, mobile menu with ✕ + ESC.
7. **Awwwards pass (restrained)** — scroll-progress hairline, word-by-word hero reveal, mask-reveal product panel, eyebrow line-draws, staggered grid reveals, 3D card tilt, hero panel micro-interactions (cursor spotlight, spark-bar isolation, animated counters), bottom-right section chip. Magnetic CTA removed (edge-flicker bug).
8. **UX audit fixes** — Lighthouse: a11y 93→100, SEO 90→100, BP 100, perf 83→85. Contrast tokens, anchors→buttons, heading order, deferred scripts + non-blocking fonts.
9. **Brand** — Sona name, S-wave logo + sparkle (favicon, README), Geist type, indigo pill buttons, real creator avatars via unavatar.io, founder portrait (`/david.jpg`) in preview chip.
10. **Repo** — github.com/davidtost5/sona live; PR #1 (Awwwards branch) open + mergeable.

### ⬜ Backlog

| P | Issue | Notes |
|---|---|---|
| **P0** | Add `SUPABASE_ANON_KEY` to Vercel + run `schema.sql` | THE blocker — real signup doesn't work without it. 5-min task, David only. |
| **P0** | Commit + push current work to GitHub | Avatars, UX fixes, founder photo all uncommitted. Merge PR #1. |
| **P1** | Stripe: create $99/yr product + `STRIPE_PAYMENT_LINK` env | Turns on real payments. |
| **P1** | Stripe webhook → `founding_members` table | Makes the seat counter count real sales. |
| **P1** | Buy domain (`sonaapp.so`) + wire Vercel + Google Workspace | Email: consider `sonalabs.so` for corporate. |
| **P1** | Build Studio (AI drafting in user's voice) | The core product. /app tab currently honest "coming soon". |
| **P1** | Build Voice model training pipeline | Second core feature. |
| **P2** | Performance round → Lighthouse 95+ | Minify CSS, lazy-load Supabase on modal open, cache headers. |
| **P2** | Founder block in footer (portrait at 56–64px + LinkedIn) | Trust signal; photo already optimized and deployed. |
| **P2** | Real outlier-post ingestion to replace SEED_IDEAS | Replace static demo data with live scraped posts. |
