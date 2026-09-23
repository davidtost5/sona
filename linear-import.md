# Sona — Linear import (staged 2026-06-10, status re-verified 2026-09-17)

> Staged locally because the Linear MCP connection was down.
> Push these as issues when reconnected. ✅ = Done, ◐ = Partial, ⬜ = Open.
>
> **Re-verified against the repo and production on 2026-09-17.** Every status
> below was checked, not assumed; the evidence is in the Notes column. The
> pricing model changed since this file was written, which retires one item
> outright rather than completing it.

## Project: Sona — Launch

### ✅ Done (log for the record)

1. **Marketing site v1** — hero + trust microbar, personas, bento grid, interactive studio preview, formats showcase, proof section, FAQ, big-wordmark footer.
2. **Auth + /app studio** — authenticated dashboard, saved ideas with RLS, sign-out. Auth has since moved from Supabase to Clerk (`f33fe29`, `81ecade`).
3. **Forms → Supabase** — waitlist (`/api/waitlist`) with queue-position card; contact form (`/api/contact`).
4. **Clock-based auto theme** — 7am–7pm light, else dark; minute-interval flip; no-flash head bootstrap.
5. **Mobile optimization** — safe-area insets, stacked CTAs, 16px inputs, pill nav in /app, mobile menu with ✕ + ESC.
6. **Awwwards pass (restrained)** — scroll-progress hairline, hero reveal, mask-reveal panel, eyebrow line-draws, staggered reveals, section chip.
7. **UX audit fixes** — a11y 93→100, SEO 90→100, BP 100. Contrast tokens, anchors→buttons, heading order, deferred scripts.
8. **Brand** — Sona name, S-wave logo + sparkle, Geist type, founder portrait.
9. **Repo** — github.com/davidtost5/sona live.

### Backlog — re-verified 2026-09-17

| P | Issue | Status | Notes |
|---|---|---|---|
| **P0** | Add `SUPABASE_ANON_KEY` to Vercel + run `schema.sql` | ✅ | Production `/api/auth-config` returns `configured: true` with a live anon key. |
| **P0** | Commit + push current work to GitHub; merge PR #1 | ✅ | `main` at `3f8e0e6`; 31 commits past the state this file described. |
| **P1** | Stripe: create $99/yr product + `STRIPE_PAYMENT_LINK` | ⬜ **Retired, replaced** | The $99 Founding tier no longer exists. `api/checkout.js` now serves a Free / Creator $19 / Pro $39 ladder over four `STRIPE_LINK_*` links, and deliberately refuses to fall back to the old variable. Superseded by the new P0 below. |
| **P1** | Stripe webhook → `founding_members` table | ✅ | `api/stripe-webhook.js:77` upserts on `stripe_session_id`. Code is done; it cannot fire while no payment link is configured. |
| **P1** | Buy domain + wire Vercel + Google Workspace | ✅ | `buildwithsona.com` live and serving. |
| **P1** | Build Studio (AI drafting in user's voice) | ⬜ **Deliberately deferred** | No API route calls a model at all. `api/decode.js` was removed in `e51f78f` ("Run the product on zero API spend"). This is a positioning choice, not a gap — `decode.js` had stated the thesis as "we don't write the post for you". Worth a decision, not just a build. |
| **P1** | Build Voice model training pipeline | ⬜ | `profiles.style_guide` is stored and editable in /app, but nothing consumes it. Blocked on the Studio decision above. |
| **P2** | Performance round → Lighthouse 95+ | ❓ Unverified | Not measurable from here; needs a real run. |
| **P2** | Founder block in footer | ✅ | `david.jpg` referenced in `public/index.html`. |
| **P2** | Real outlier ingestion to replace SEED_IDEAS | ◐ | `api/ingest.js` ships with cron ingest, parallel fetch, Substack as a second source (`a2e8829`, `817861d`, `6a96d39`, `827be5b`). `SEED_IDEAS` is still referenced in `public/app.html` — finish the swap to close this. |

### Found 2026-09-17 — not in the original import

| P | Issue | Notes |
|---|---|---|
| **P0** | Re-add the five Clerk CNAMEs | Production sign-in is down. The records documented in `a515ce9` were never restored after the Spaceship zone outage of 2026-09-09. `clerk.buildwithsona.com` resolves to Vercel and returns 404, so clerk-js never loads and the modal opens empty. |
| **P0** | Confirm `migration-clerk-auth.sql` has been applied | Retypes `user_id` uuid→text and rewrites the RLS policies across `profiles`, `saved_ideas`, `drafts`, `lists`, `custom_creators` (46 statements). If it has not run, fixing DNS yields a working login into an app that returns zero rows — a silent failure, worse than the current loud one. |
| **P0** | Configure the four `STRIPE_LINK_*` env vars | All four plans report `configured: false` in production. There is currently no way to pay for Sona. |
| **P1** | `clerk-auth.js`: fall back on availability, not configuration | `route()` delegates to the captured Supabase implementation only when the publishable key is unset, never when Clerk fails to load. The fallback exists and is one try/catch away from working; it would have kept sign-in alive through this entire outage. |
| **P1** | Remove or narrow the wildcard DNS record | An invented hostname resolves to the Vercel IPs, so a missing CNAME fails as a confusing 404/CORS error instead of NXDOMAIN. This is what hid the missing Clerk records. |
| **P2** | Retire this file | It drifted three months before anyone noticed, and gave stale answers in the meantime. Push to Linear and delete it, or keep it re-verified. |
