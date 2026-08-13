# Roadmap

*Drafted 2026-08-13. The product is defined in `design-brief.md`; the visual system in `design/hinted/`. This document splits the build into phases. Each phase ends with something real and verified on production — the pipeline makes shipping cheap, so we ship at every step.*

## How we work

- **Just-in-time specs.** At the start of each phase we write a short spec (`docs/specs/phase-N-<name>.md`) covering exactly that phase: decisions, schema changes, routes, edge cases, and its definition of done. We don't spec phases far ahead — later phases will be reshaped by what we learn.
- **Small PRs, always green.** Every PR passes `pnpm check` + smoke; preview URLs come free. Codex review before merge for anything non-trivial.
- **The design system is law.** `docs/design/hinted/` decides how things look and behave; its "do not add" list (no animations, no toasts, no spinners, no loading states) is binding. Deviations get discussed, not slipped in.
- **Migrations are forward-only** (D1). Schema changes are additive where possible and always land before the code that needs them.

## Phase 0 — Infrastructure ✅ (done)

Scaffold (Workers + Hono + D1 + Drizzle + Vitest-in-workerd + Biome), deploy pipeline (Workers Builds + preview URLs + PR-gating CI), product brief, Hinted design system. Production: https://wishlist.staugaard.workers.dev

## Phase 1 — Foundation: the public list page

*The walking skeleton: real schema, the design system rendered by real code, and the showpiece screen live on production.*

**Scope**
- Real schema v1: `users`, `sessions`, `lists` (id, owner, name, occasion label, public slug, position), `items` (title, note, price text, url, image, priority, position). Public slug = unguessable (~128-bit) URL token; the list URL is the share model.
- Port the Hinted tokens (`styles.css`) and the read-only components (Wordmark, ItemPhoto, PriorityStamp, NoteTag, ItemCard, Button) to Hono JSX + the repo's CSS.
- The giver page at `/l/:slug`: top bar, header, dashed rule, item cards, closing line — matching `mockups/hinted-screens.html` exactly, light + dark.
- Seed script creates a realistic demo list locally and in prod.
- 404 page (wrong slug) in the same visual voice.

**Out of scope:** any owner UI, any auth UI, scraping.

**Exit criteria:** a seeded list is viewable at its public URL on production, on a phone, in both themes; visual match to the mockup; tests cover the route (found/not-found, escaping, ordering).

**Spec decisions to settle first:** slug format/length; CSS delivery (single stylesheet vs per-route); font self-hosting vs Google Fonts (handoff flags the tradeoff); drop `app_meta`?

## Phase 2 — The owner's workbench

*Sign in, tend your lists. The full owner loop with manual item entry.*

**Scope**
- Owner auth — **passwordless email code, hand-rolled** (decided 2026-08-13 after research): 6-digit single-use code, hashed in D1 with 10-minute expiry, sent via Resend (raw fetch, no SDK); timing-safe verify (`node:crypto.timingSafeEqual`); opaque session ID in a D1 `sessions` table behind an `HttpOnly; Secure; SameSite=Lax` cookie; rate limiting on the login endpoints. ~250 lines, zero dependencies. Owners are invited family — no public signup marketing, just the email/code flow.
- Owner home ("Your lists"), list create/rename/delete, the item row + in-place editor (one open at a time, focus management per the handoff), manual item entry via the paste bar (typing words is first-class), reorder (drag on desktop, buttons/handle on mobile — spec will decide), copy-link affordance ("Copied" inline, no toast).
- Desktop sidebar layout + stacked phone layout.

**Out of scope:** URL auto-fill (the paste bar accepts URLs but stores them as the link field of a hand-titled item until Phase 3).

**Exit criteria:** a family member can be invited, sign in on a phone, build a list by hand, reorder it, and send the link — all on production. Auth + CRUD covered by tests.

## Phase 3 — The magic paste

*The one micro-moment that gets delight: paste a link, the card writes itself in.*

**Scope**
- OG/metadata fetch in the Worker (title, image, price where available), with the handoff's progressive fill-in behavior: the row is real from the first frame (URL host as title), fields settle in as the fetch resolves; failure leaves a valid hand-typed item, never an error.
- Image pipeline: fetch the `og:image` once, store a copy in R2, serve via the Worker. Mixed/missing images handled by ItemPhoto's states.
- Known-hostile sites (Amazon) degrade gracefully by design; Microlink free tier is the documented escape hatch if roll-your-own proves too weak.

**Exit criteria:** pasting a typical shop URL yields a filled card within a few seconds; pasting an Amazon URL yields a clean manual item with the link attached; images survive the source site changing.

## Phase 4 — Fast, polished, installable

**Scope**
- Edge caching: cache the public list page with `Cache-Tag: list:{id}`, purge on any write, stale-while-revalidate. The giver page becomes effectively static until the owner edits.
- PWA (manifest, icons, installability), theme toggle (system default + manual override), empty states and full copy pass in the handoff's voice, accessibility audit (AA contrast is designed-in; verify focus order, labels, large-font behavior), Lighthouse pass.

**Exit criteria:** repeat giver visits are cache hits; an edit is visible on the next request; Lighthouse ≥ 95 across the board on the giver page.

## Phase 5 — Move-in day (rescoped 2026-08-14)

**Scope** — the user decided to run solo-owner for now: one owner account (Mick), the family participates purely as account-less givers via share links — which is the product's core asymmetric design doing its job. So Phase 5 is operational readiness, not onboarding:
- Domain: live at **wishlist.season4.app** ✅ (delegation-bridge records at Porkbun to be deleted after ~2026-08-16).
- Ops runbook (`docs/runbook.md`): rollback, D1 Time Travel restore, adding a future owner, email destinations, R2 notes.
- Drills: capture a Time Travel bookmark + document restore; rollback rehearsal.
- Alerting: deliberately none (healthz exists; family-scale).
- Watch real usage; fix papercuts as they surface.
- (Family owner accounts: two documented commands away, whenever wanted.)

**Exit criteria:** the owner uses it for a real occasion; the runbook exists and its commands are verified.

## Later / explicitly parked

Kid profiles managed by a parent · family-space browsing (grouping, not access) · Secret Santa drawing · stale-item nudges · price re-checks · browser extension · any claiming/reserving feature (**decided against — see brief**).

## Decisions log

| Decision | Status |
|---|---|
| Lists are public by URL; no share tokens, no spaces | ✅ 2026-08-13 |
| No claiming feature | ✅ 2026-08-13 |
| Owner auth: hand-rolled passwordless email code + D1 sessions | ✅ 2026-08-13 — ranked first by research (~250 LOC, zero deps, UX identical to library OTP). Runners-up: Cloudflare Access (needs custom domain), Better Auth (more glue than hand-rolling). Passkeys possible later as an optional add-on, never the only door |
| Slug format, font hosting, CSS delivery | Phase 1 spec |
| Reorder interaction on mobile | Phase 2 spec |
| Email via Cloudflare Email Service (no Resend); domain = wishlist.season4.app | ✅ 2026-08-14 |
