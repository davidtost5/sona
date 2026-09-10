# DNS records for buildwithsona.com

Written down because on 2026-09-09 Spaceship stopped serving the zone —
their nameservers answered `REFUSED`, every record vanished at once, and
rebuilding it meant remembering what had been there. This file is the
answer to "what was in the zone".

Every record below was read back from the live authoritative nameservers
before they went down, so this is what the working zone contained — not
what it was supposed to contain.

**Registrar:** Name.com · **DNS host:** Spaceship (`launch1/launch2.spaceship.net`)

## The zone

| Type | Host | Value | Why it exists |
|------|------|-------|---------------|
| A | `@` | `76.76.21.21` | Vercel. The site. |
| MX | `@` | `mx1.spacemail.com` (priority 0) | Receives mail |
| MX | `@` | `mx2.spacemail.com` (priority 0) | Receives mail |
| TXT | `@` | `v=spf1 include:spf.spacemail.com ~all` | Authorises Spacemail to send |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | DMARC, monitoring only |
| CNAME | `clerk` | `frontend-api.clerk.services` | Clerk frontend API — **sign-in breaks without it** |
| CNAME | `accounts` | `accounts.clerk.services` | Clerk hosted account pages |
| CNAME | `clkmail` | `mail.9jezsokds2kk.clerk.services` | Clerk sends sign-in codes |
| CNAME | `clk._domainkey` | `dkim1.9jezsokds2kk.clerk.services` | Clerk DKIM |
| CNAME | `clk2._domainkey` | `dkim2.9jezsokds2kk.clerk.services` | Clerk DKIM |

Enter the **host** as written — `clerk`, not `clerk.buildwithsona.com`.
Spaceship appends the domain itself, and typing the full name produces
`clerk.buildwithsona.com.buildwithsona.com`.

## Not verified

`www` was never checked while the zone was up, so it is not listed. If
`www.buildwithsona.com` used to work, it needs a CNAME to
`cname.vercel-dns.com` — but that is an assumption, not a record I read.

## Order matters

Add the apex `A` first and confirm the site loads. Then Clerk's five
CNAMEs, then mail. Clerk will not re-verify instantly; `clerk deploy
status` reports dns/ssl/mail separately and SSL follows DNS by a few
minutes.

## Worth considering: move DNS to Vercel

The site is on Vercel already, and this outage was a dependency on a
third DNS host that nothing else needed. Moving the zone means changing
the nameservers at Name.com to Vercel's and re-entering the table above —
one provider fewer to be broken by, and Vercel manages the apex record
itself.

The cost is that mail and Clerk records have to be re-entered again during
the move, and the domain is unreachable while nameservers propagate. Not
something to do while the zone is already down — restore first, migrate
deliberately.
