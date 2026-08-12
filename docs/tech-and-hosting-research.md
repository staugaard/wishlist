# Wishlist App — Tech & Hosting Research

*Researched August 13, 2026, via five research tracks: hosting providers, frameworks, auth/database/supporting services, the wishlist-app domain, and a deep pass on scale-to-zero platforms. All pricing and version claims checked against current sources on that date.*

> **DECIDED (2026-08-13): Cloudflare Workers + D1 + Hono.** The rest of this document is the supporting research; the stack details below (Drizzle, Better Auth, R2, cache-tag purging) remain the plan of record unless revisited.

**Decision criteria, in priority order:** (1) scales all the way to zero — $0 and zero ops while idle for months, (2) scales up very high without thought, (3) dead-simple deploys, (4) a great caching story. Framework DX is explicitly secondary — the app is tiny, and any mainstream framework can express it.

> An earlier draft of this document recommended Rails 8 + SQLite on an always-on host. That was rejected: it optimizes for developer familiarity on an app too small for that to matter, and an always-on process is exactly what this app shouldn't need. The platform is the decision; the framework follows.

## TL;DR — the recommended build

**Cloudflare Workers + D1 + R2**, with Hono or SvelteKit on top.

| Layer | Choice | Why |
|---|---|---|
| Platform | **Cloudflare Workers** | True scale-to-zero with no cold start (V8 isolates start in ms — no VM/container to wake); scales to any burst on flat per-request pricing; `wrangler deploy` or git-connected Vite builds |
| Database | **D1** (SQLite) via Drizzle ORM | Literally zero idle billing — pure per-query pricing, no autosuspend/wake step at all. Free tier: 5GB, 5M row-reads/day. Built-in point-in-time recovery ("Time Travel", 7–30 days, zero setup) |
| Caching | **Cache API + cache tags + stale-while-revalidate** | Tag SSR'd pages `list:{id}`; purge the tag on any write in the same request. Cache-tag purge became available on **all plans including Free in April 2025** (formerly Enterprise-only). SWR covers any race window; Smart Tiered Cache is free and zero-config |
| Auth | **Better Auth** (Drizzle adapter; `better-auth-cloudflare` for D1/KV/R2 wiring) — owners only | Viewers/claimers never log in: unguessable share links + name-at-claim (see product section) |
| Images | **R2** | 10GB free, zero egress fees, S3-compatible; cache a copy of each product's `og:image` on add |
| Framework | **Hono** (14KB, JSX SSR, Workers-native) or **SvelteKit** (`adapter-cloudflare`) | Secondary decision by design. React Router v7/8, Astro, Nuxt, SolidStart etc. are also first-class on Workers; Next.js runs via OpenNext but carries Vercel-shaped assumptions |
| Email | Skip; Resend free tier (3,000/mo) if ever needed | Owners share links themselves |

**Cost: $0/month while idle — almost certainly $0/month forever at family scale** (free tier: 100k requests/day, static assets free and unlimited). If it ever outgrows that: flat $5/mo Workers Paid. Plus a domain (~$10/yr).

**Runner-up:** Vercel + Next.js + Neon (details below).

---

## 1. Platform: why Cloudflare Workers wins each criterion

1. **Scale to zero.** Workers has no idle state to manage — a request that doesn't happen costs nothing, and the first request after three quiet months is served in milliseconds by a V8 isolate, not a waking VM. D1 likewise has no autosuspend/wake cycle — unlike every Postgres option. This is the only platform combination surveyed where "idle 11 months a year" has zero cost *and* zero first-visitor penalty.
2. **Scale up.** Free tier absorbs 100k requests/day; Workers Paid ($5/mo flat) includes 10M requests/mo with predictable per-request/per-CPU-ms overage. No capacity planning, ever.
3. **Deploys.** One `wrangler deploy`, or git-connected builds. Local dev is genuinely good now: the Cloudflare Vite plugin (1.0/GA) runs the real `workerd` runtime in dev — the old "miniflare is flaky" complaints are stale.
4. **Caching.** The app sits *inside* the CDN. Idiomatic pattern for this exact app: SSR the wishlist page, cache it via the Cache API tagged `list:{id}`, and on any write (add item, claim, un-claim) purge that tag in the same request (`ctx.cache.purge({tags})`, or in `waitUntil`). Stale-while-revalidate serves instantly while re-rendering in the background. Since April 2025 all purge methods — tag, URL, prefix, everything — are available on every plan including Free (rate-limited to 5 req/min, ample here). Nothing else surveyed matches this without an enterprise contract.

### Honest caveats

- **Outage record**: six significant Cloudflare incidents in the trailing 12 months, including the major Nov 18, 2025 global outage (~1 in 5 webpages affected) and Dec 5, 2025 / Feb 20, 2026 events. Several touched Workers KV specifically. Zero ops for you also means inheriting their bad days.
- **Lock-in is real**: D1 + KV + R2 bindings and wrangler config don't port. Mitigation: D1 is SQLite and Drizzle is portable, so the data layer moves with moderate effort; the caching code wouldn't.
- **Runtime limits**: 128MB memory hard cap, no long-lived processes (Cron Triggers/Queues cover background needs), Node compat is a polyfill layer (`unenv`) — deep native/fs/crypto-heavy libraries can misbehave. None of these bite an app this size.
- **D1 notes**: single-writer architecture (fine — this app's writes are tiny); global read replication is still beta (~350ms propagation) — simply don't enable it.
- **Worth prototyping**: a **Durable Object per wishlist** (SQLite-in-DO, billing live since Jan 2026) gives free atomicity for the claim flow — two relatives claiming the same gift simultaneously serialize through one object. Not required (a unique constraint on D1 also works), but an elegant fit.

### Auth on Workers, specifically

Better Auth runs on Workers + D1 through `drizzleAdapter(db, { provider: "sqlite" })`; the community `better-auth-cloudflare` package bundles D1/KV/R2 wiring. Two known footguns: construct the Drizzle-D1 client once per request at the top of middleware (per-call construction has caused multi-second hangs), and never keep session/rate-limit state in module-scope globals — isolate reuse is an optimization, not a guarantee; state belongs in D1/KV/DO.

---

## 2. Runner-up and the rest of the field

### #2 — Vercel (+ Next.js + Neon)

Genuinely good: Fluid Compute (default since April 2025) closed most of the old cold-start gap (bytecode caching, $0 for I/O-wait), `revalidateTag()`/`revalidatePath()` called from the same Server Action that handles a claim is a mature invalidate-on-write pattern, and git-push deploys are the simplest anywhere. Hobby-tier allowances (1M function invocations, 4h active CPU/mo) dwarf family traffic.

Loses to Workers on two things: **the database layer** — "Vercel Postgres" no longer exists as a product (fully migrated to Neon marketplace billing in 2024–25), and Neon's mandatory free-tier autosuspend means the first visitor after idle pays a ~0.5–1s DB wake *on top of* any function cold start, where D1 has no wake step at all; and **the Hobby ToS** — strictly non-commercial by contract, self-policed forever (even a tip jar technically requires Pro at $20/mo/seat).

### Ruled out, with reasons

- **Netlify**: post-2025 credit pricing (revised again April 2026) bills compute by GB-hour — a poor shape for spiky-then-idle traffic — and it has no invalidation primitive comparable to cache tags or `revalidateTag`. Clearly deprioritized this use case.
- **Deno Deploy**: fine platform, but no native relational DB (KV only; Postgres means Neon-over-network anyway), several features still Early Access, and a thin caching/invalidation story. Weak on exactly criterion 4.
- **AWS Lambda + SST**: SST entered maintenance mode in 2025 (team pivoted to OpenCode); the IAM/CDK/API-Gateway/RDS-Proxy ceremony is wildly disproportionate for this app; Node cold starts 100–500ms unless you pay for provisioned concurrency, which defeats scale-to-zero.
- **Fly.io machines auto-stop**: real suspend/resume (~hundreds of ms) but bimodal — a failed snapshot restore means ~2s+ cold boot; volumes bill while stopped, so a stopped app is not a free app; no free tier anymore.
- **Railway serverless toggle**: sleeps after 10 idle minutes, but services holding DB connections can't use it, and keepalives/health checks are reported to keep services accidentally awake.
- **Supabase + static frontend**: free projects pause after 7 idle days — the exact failure mode for a bursty holiday app — and going fully client-side with RLS moves claim enforcement to the client, a materially different trust model.
- **Always-on hosts** (Render $7/mo, Hetzner+Kamal, Heroku): fail criterion 1 by definition. Also: Heroku entered "sustaining engineering" mode (security patches only) in February 2026 — don't start anything there regardless.

### Database-for-serverless summary

| DB | Idle cost / wake penalty | Verdict |
|---|---|---|
| **D1** | Zero / none — pure per-query billing | The pick, paired with Workers |
| **Neon** | Free-tier autosuspend; ~0.5–1s to first query | The pick if on Vercel; post-Databricks pricing actually improved |
| **Turso** | **Deprecated scale-to-zero for new databases in January 2026** — new DBs are always-on with a compute charge | Ruled out on the top criterion; company also mid-rewrite/mid-pivot |
| **SQLite-in-Durable-Object** | Near-zero (duration billing while awake; hibernation minimizes) | Niche: one-DO-per-wishlist for atomic claims |

---

## 3. Framework (a deliberately secondary decision)

On Workers, the first-class options in 2026 are Hono (Workers-native, 14KB, built-in JSX SSR — the natural fit for an app this small), SvelteKit (`adapter-cloudflare`, actively maintained, D1 via `platform.env`), React Router v7/8, Astro, Nuxt, SolidStart, Qwik, and TanStack Start. Next.js runs via `@opennextjs/cloudflare` (still beta; workable but the least native choice on Workers — if Next.js is the preference, Vercel is its home).

For contrast, the full-framework comparison (Rails 8.1, Laravel 13, Django 6.1, Phoenix, Next.js, SvelteKit, Astro, Hono/Flask) concluded the batteries-included server frameworks win on 5-year stability but all assume a persistent process — which is the requirement this project rejected. The one JS-ecosystem fact worth retaining: **Auth.js/NextAuth is in security-patch-only mode since Sept 2025 (absorbed by Better Auth); Lucia is deprecated.** Better Auth is the standard.

For a "simple but beautiful" bar: Tailwind everywhere; shadcn/ui if React-based, daisyUI or hand-rolled with Hono/SvelteKit.

---

## 4. Product design findings (domain research)

### The three decisions that matter most

1. **Claiming model → hidden-from-owner, named-to-others, self-releasable, no account.** A claim stores a display name plus a secret release token (kept in the claimer's browser/link) so the same person can un-claim later. No surveyed app handles un-claiming well, and stale-claim expiry (a forgotten October claim still locking an item at Christmas) is absent from the entire market — both are cheap, genuine differentiators.
2. **Viewer identity → asymmetric.** Owners authenticate; viewers/claimers never do. Every unguessable share link grants view+claim; claimers type a display name — visible to other gift-givers, hidden from the owner. This is what GiftList, Things To Get Me, Elfster share links, and cmintey/wishlist's Registry Mode converged on, and it avoids the category's #1 complaint: forcing grandma to create an account. Accept that claims are device-bound; mitigate with the release token, not accounts.
3. **Item entry → URL-paste auto-fill primary, manual entry a first-class equal, not a fallback error state.** Auto-fill (title/image/price from OG tags) is table stakes in 2026, but scraping is a permanent maintenance burden — and **Amazon is a dead end**: its 2026 anti-bot stack fingerprints TLS handshakes, and the official product API requires 10 affiliate sales per rolling 30 days just to keep access (PA-API 5.0 itself retires April 30, 2026). Amazon links must degrade gracefully to manual entry. Roll your own OG fetch + cache-in-DB; Microlink's free tier (50 req/day) is the escape hatch. Bonus: the claim-page burst traffic that scraping-triggered fetches could cause is neutralized by the edge-caching design anyway.

### MVP feature set

**Must have:** owner accounts · one list per person, occasion as a tag (not one list per occasion) · family/group space with an unguessable share link · paste-URL auto-fill with graceful manual fallback · claim/un-claim with display name, hidden from owner · edit/reorder/prioritize items · mobile-responsive PWA.

**Fast follow:** Secret Santa drawing with exclusion rules (cheap, heavily requested) · parent-managed kid profiles (no child logins) · stale-claim nudges · multi-tenancy so one deployment serves unrelated friend circles (a real gap in the self-hosted field).

**Explicitly out:** browser extension, price tracking, retailer registry sync, crowdfunding/cash gifts.

### Data-model sketch

```
User            — owners only (email, auth credentials)
FamilySpace     — the circle (name, invite_link_token); multi-tenancy boundary
Person          — wishlist owner within a space; user_id nullable
                  (parent-managed kid profiles have managed_by_user_id instead)
Item            — person_id, title, image, price, source_url, notes,
                  priority, occasion_tag, added_by (supports suggestions)
Claim           — item_id, claimer_display_name, claimer_release_token,
                  optional contact email, claimed_at
                  → deliberately NOT a foreign key to User
ShareLink       — unguessable token scoped to a space or a single person's list
SecretSantaDraw — space, year, exclusion rules → Assignments
```

The two deliberate decouplings — Claim↮User and Person↮User — enable account-less claiming and kid profiles; FamilySpace as a first-class entity avoids the multi-tenant retrofit pain existing self-hosted apps are stuck in. (If prototyping the Durable-Object route: one DO per FamilySpace or per Person's list is the natural sharding, with claims serialized inside it.)

### Prior art worth knowing

- **cmintey/wishlist** (SvelteKit + Prisma, ~615★, actively maintained, MIT) — the most mature open-source implementation, best reference for group/registry-mode mechanics. If the goal were purely *having* a wishlist, self-hosting it is the shortest path; the case for building is the fun plus the unsolved gaps (un-claiming, claim staleness, multi-tenancy, taste) — and it assumes a persistent server, so it wouldn't meet the scale-to-zero bar either.
- **Christmas Community** (Node + PouchDB, ~422★) — one family per instance. **wishthis** (PHP) — simple, but auto-injects an Amazon affiliate tag.
- Commercial failure modes per reviews: Elfster's unstoppable marketing spam, Giftster's dated UI and account-gated sharing, ads on free tiers — and Amazon's **March 2026 policy change exposing wishlist recipients' shipping addresses to third-party sellers**, a live privacy argument for owning this.

---

## 5. Cost summary

| Item | Monthly |
|---|---|
| Cloudflare Workers + D1 + R2 (free tier; $5/mo flat if ever outgrown) | $0 |
| Link previews (own OG fetch; Microlink free tier if needed) | $0 |
| Email (skip; Resend free tier — 3,000/mo — if added) | $0 |
| Domain | ~$10/year |
| **Total** | **$0/mo + domain** |

One vendor account to maintain (Cloudflare). No auth vendor, no database vendor, no link-preview vendor, no email vendor at baseline.

## 6. Suggested next steps

1. Pick the framework flavor on Workers — Hono (most minimal, Workers-native) vs SvelteKit (more structure, still first-class). This is a taste call, not a risk call.
2. Scaffold with the Cloudflare Vite plugin; wire D1 + Drizzle + Better Auth (`better-auth-cloudflare`).
3. Spike the share-link + claim flow first — it's the product's soul and the least conventional part. Decide D1-unique-constraint vs DO-per-list for claim atomicity while it's cheap to change.
4. Implement the cache-tag pattern (`Cache-Tag: list:{id}`, purge-on-write, SWR) early so the caching story is proven before the UI gets attention.
5. Prototype the OG-fetch path against real retailer URLs to calibrate the manual-entry fallback.
