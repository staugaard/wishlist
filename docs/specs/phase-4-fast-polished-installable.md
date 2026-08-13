# Phase 4 spec — fast, polished, installable

*Written 2026-08-14. Scope per `../roadmap.md` Phase 4: edge caching, PWA installability, theme toggle, empty states + copy pass, accessibility, Lighthouse ≥ 95. Out of scope: family onboarding/ops drills (Phase 5).*

## Decisions settled by this spec

| Question | Decision | Why |
|---|---|---|
| Edge-cache invalidation | **Validator-keyed caching, no purging.** The giver page is cached in the colo Cache API under a key derived from the list's `updatedAt` (`/l/{slug}@{updatedAt-epoch}`); every mutation of a list *or its items* touches `lists.updatedAt`, so the next request constructs a new key and misses straight to a fresh render. Old entries age out by TTL (30 days) | Exact "edit visible on the next request" freshness with **zero purge machinery**: no API token secret, no tag-purge API dependency, and correctness is per-request provable. Cost: one indexed single-row D1 read per request (slug → id/updatedAt), which we need for 404s anyway; the items query + SSR render are what we skip |
| What gets edge-cached | `GET /l/:slug` HTML and `/img/*` bodies (already immutable by key). Owner pages, auth pages, healthz: never | Public + identical-for-everyone only. The giver page renders the same for every viewer incl. the owner, so cookies can't leak through it |
| Browser caching of the giver page | `Cache-Control: no-cache` (always revalidate at the edge; bfcache still applies) | Phones must show edits promptly; the edge is the fast layer, the browser need not gamble |
| Cache observability | `X-Hinted-Cache: HIT\|MISS` response header | Exit criteria and tests need it; harmless to expose |
| List deletion staleness | None possible: the slug row lookup precedes any cache read — deleted list → 404 immediately | Falls out of the validator design |
| PWA scope | **Manifest + icons + theme-color metas only. No service worker.** | Chrome installs SW-less PWAs; offline support is real machinery for a use case ("browsing the family's wishlist with no internet") that barely exists. Explicitly parked |
| App icons | Generated once by a small script (Playwright screenshot of an HTML tile: `--paper-card` ground, the H*i* wordmark mark in Newsreader with the accent italic), committed as static PNGs (192, 512, maskable 512, apple-touch 180) + an SVG favicon | The handoff has no logo file by design ("the wordmark is live text"); the icon is the wordmark's first two letters as a stamp. Committed assets, not build-time magic |
| Theme toggle | Third (and final planned) JS sprinkle: a quiet text button cycling **Auto → Light → Dark**, label showing the current choice; sets `data-theme` on `<html>` + `localStorage`; a 3-line inline head script applies the stored choice pre-paint (no flash). Placement: in the top bar's right cluster on owner pages (next to Sign out); beneath the closing line on the giver page | The CSS was built for exactly this in Phase 1 (`[data-theme]` beats the media query in both directions). Quiet-underline styling, no icons — the design has no icon language |
| Empty giver page | A list with zero items shows the header + one line in the handoff voice: "Nothing here yet — check back soon." | Currently it's just header+closing line, which reads like a bug |
| Copy pass | Audit every user-facing string against the handoff's voice rules (plainspoken, no exclamation marks, never "successfully"); fix drift; add `<meta name="description">` to the giver page (list intro or a neutral line) and proper `theme-color` metas for both schemes | Words are part of the design system |
| Accessibility pass | Verify (and fix where needed): landmark structure, heading order, focus order incl. the editor's autofocus/return, labels on icon-ish buttons (movers, grip is `aria-hidden`), form labels, 200%-text-zoom layout, `prefers-reduced-motion` (settle + any transition), contrast in both themes (designed-in; re-verify the toggle button itself) | AA was designed in; this is the proof pass |
| Lighthouse | ≥ 95 in Performance / Accessibility / Best Practices / SEO on `/l/<demo>` (mobile emulation, production URL). Contingency if font swap causes CLS: add fallback font metrics (`size-adjust`) for Newsreader/Hanken | The roadmap's number, measured honestly against prod |

## Implementation sketch

- **`lists.updatedAt` touching**: item create/update/delete/move all gain one `UPDATE lists SET updated_at = ? WHERE id = ?`. (List-level edits already touch it.)
- **`src/lib/pageCache.ts`**: `servePublicList(c)` — slug → single-row lookup (`id, updatedAt`, 404 on miss) → synthetic cache key URL → `caches.default.match` → on miss, run the existing items query + render, `cache.put` with `Cache-Control: s-maxage=2592000` on the stored copy; strip that header on the way out, reply `Cache-Control: no-cache` + `X-Hinted-Cache`. `/img/*` handler gains the same match/put wrapper (keyed by real URL — content-addressed already).
- **PWA**: `public/manifest.webmanifest` (name "Hinted", `display: standalone`, `start_url: /`, colors from tokens), icons in `public/icons/`, `<link rel="manifest">` + `apple-touch-icon` + SVG favicon + dual `theme-color` metas in the renderer. Icon-generation script in `scripts/make-icons.mjs` (run once, assets committed).
- **Theme**: inline pre-paint script in `renderer.tsx` head; toggle button component posting nothing — pure client (`data-theme` + localStorage). CSS: only the toggle button styling is new, tokens only.
- **Tests**: cache HIT on second request / MISS after item edit (real `caches.default` in workerd); every item mutation touches the parent list's `updatedAt`; deleted list 404s immediately; giver page `Cache-Control: no-cache`; `/img/*` HIT path; manifest + icons serve 200; empty-list giver page copy; theme attributes present.
- **Verification beyond tests**: Lighthouse CLI (mobile) against production post-merge; Codex browser pass for the toggle (no flash on reload, persists, both themes AA-legible) and installability (manifest parses, icons render).

## Definition of done

1. Repeat giver-page visits serve from the edge (`X-Hinted-Cache: HIT`) in the same colo; an owner edit is visible on the very next giver request (validator key rolls).
2. `/img/*` repeat hits don't touch R2 (HIT header).
3. Add-to-Home-Screen on iOS and Android yields a Hinted-branded standalone app opening on the lists/home page.
4. Theme toggle works on phone + desktop, survives reload without flash, and Auto still follows the OS.
5. Lighthouse ≥ 95 ×4 categories on the production demo list (mobile).
6. Copy + a11y audits done with fixes landed; `pnpm check` + smoke green; Codex review + browser verification per house rules.

## Explicitly out of scope

Service worker / offline (parked — revisit only if a real need appears) · push notifications · analytics (never, per brief) · tag-purge cache upgrade (only if validator-keying ever proves insufficient) · list-level `updatedAt` display in UI (future nicety).
