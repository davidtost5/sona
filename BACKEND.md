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

## Monetization with Polar.so

Sona supports **Polar.so** for checkout links and webhook fulfillment.

### 1. Configure Polar Product
1. Create an account on [polar.sh](https://polar.sh) and set up your Organization.
2. Create a Product (e.g., "Sona Founding Member", $99/year or custom tier).
3. Copy the Product Checkout URL (e.g. `https://buy.polar.sh/polar_cl_...`).

### 2. Configure Polar Webhook
1. Go to **Polar Dashboard → Webhooks → Add Endpoint**.
2. Endpoint URL: `https://your-domain.vercel.app/api/polar-webhook`
3. Select events: `order.created`, `checkout.updated`, `subscription.created`.
4. Copy the Webhook Secret (`whsec_...`).

### 3. Add Environment Variables in Vercel
```env
POLAR_CHECKOUT_URL   = https://buy.polar.sh/polar_cl_...
POLAR_WEBHOOK_SECRET = whsec_...
```

When a visitor clicks "Claim Founding Access", `/api/checkout` returns `POLAR_CHECKOUT_URL`. Upon payment completion, Polar sends a webhook to `/api/polar-webhook`, creating a row in `founding_members` in Supabase.

## Files

| File | Role |
|------|------|
| `public/data.js` | The data layer. The only place `MODE` lives. |
| `public/admin.html` | Lead review dashboard (mock mode reads localStorage). |
| `api/waitlist.js` | Serverless endpoint for signups (used in `api` mode). |
| `api/contact.js` | Serverless endpoint for messages. |
| `api/checkout.js` | Serverless endpoint returning checkout URL (Polar / Stripe). |
| `api/polar-webhook.js` | Polar webhook endpoint (credits `founding_members`). |
| `api/stripe-webhook.js` | Stripe webhook endpoint. |
| `api/_supabase.js` | Shared Supabase client + SQL schema docs. |

## What's still needed for a *full product app*

This covers lead capture and monetization. A logged-in product includes configured Supabase **Auth** (scaffolded in `auth.js`), protected studio dashboard (`/app.html`), and per-user data tables with Row Level Security.
