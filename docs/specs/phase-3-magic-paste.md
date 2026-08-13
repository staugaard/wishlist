# Phase 3 spec — the magic paste

*Written 2026-08-14. Scope per `../roadmap.md` Phase 3: paste a link and the card writes itself in — metadata fetch, image pipeline, graceful degradation. Out of scope: edge caching/PWA/theme (Phase 4).*

The handoff's contract for the one micro-moment that gets delight: *"the row appears immediately with the URL's host as its title, then the title, photo and price fill in as the fetch resolves. Do NOT use a skeleton screen or a spinner — the row is real from the first frame and its fields settle into place. Keep any transition under 200ms and only on the text/image swap. If the fetch fails, the row stays as a hand-typed item with the URL in the link field; that is a valid item, not an error."*

## Decisions settled by this spec

| Question | Decision | Why |
|---|---|---|
| Fetch architecture | **Create the row synchronously (unchanged), fetch metadata in `waitUntil` after responding.** The paste POST redirects instantly to the open editor exactly as today; the background fetch updates D1 when it resolves | The row is real from the first frame by construction; no request ever blocks on a shop's server |
| Racing the owner's edits | **Fill-if-untouched writes**: the background update sets `title` only if it still equals the hostname placeholder, and `note`/`price`/image only if currently empty. A conditional `UPDATE … WHERE` per field-state, atomic, same style as the OTP hardening | The fetch must never clobber something the owner typed in the meantime |
| The "settles into place" visual | One small addition to the client sprinkle: inputs in a just-pasted row's editor carry `data-autofill`; the client polls `GET /items/:id.json` (owner-scoped) about once a second for ≤10s and swaps values **only into fields the user hasn't touched** (dirty-tracked via `input` events). No polling anywhere else; nothing on the giver page | This is the one place the brief grants delight; ~40 lines, degrades to "values appear on next page load" with JS off |
| HTML parsing | **`HTMLRewriter`** (Workers-native, streaming) over the fetched page: `og:title` / `twitter:title` / `<title>`; `og:image` / `twitter:image`; price from `og:price:amount`+`currency`, `product:price:amount`, else JSON-LD `Product.offers.price` (a `JSON.parse` of `script[type="application/ld+json"]`) | Zero dependencies, streaming, built for exactly this |
| Price formatting | Only when both amount and currency parse: display text like "About $649" / "About 649 kr" via a tiny currency-symbol map (NZD/USD/EUR/GBP/AUD/DKK…); otherwise no price | Prices are display text by schema; approximate by design; never invent a currency |
| Fetch limits | 5s timeout (`AbortSignal.timeout`), HTML responses only, first 500 KB parsed, http(s) only via the existing `safeHttpUrl`, browserish `User-Agent`/`Accept` headers | A hung shop server must never hold a Worker open; hostile content is size-capped |
| Image storage | **R2 bucket `wishlist-images`**, binding `IMAGES`. On successful metadata fetch: download `og:image` (5s timeout, `image/*` only, ≤10 MB), store at `items/{itemId}/{sha256-16}.{ext}`, record in a new `items.image_key` column (migration 0004, additive). Serve at **`GET /img/:key`** via the Worker with `Cache-Control: public, max-age=31536000, immutable` | Hotlinks rot and leak referers; content-addressed keys make caching trivially safe. `image_url` stays as source provenance + legacy fallback |
| Image rendering | `ItemPhoto` prefers `image_key` (`/img/…`) over `image_url` | Existing rows keep working; new rows never hotlink |
| Cleanup | Item/list deletion best-effort deletes the item's R2 objects in `waitUntil`; orphans are acceptable at family scale | Correctness without ceremony |
| Re-fetch on link edit | **Not in v1** — metadata fetches happen only when a row is created from a pasted URL. Editing the Link field later changes the link only. ("Fetch again" affordance parked) | Keeps the write path simple; the editor is already the manual path |
| Amazon & other hostile sites | No special-casing: their fetch fails or times out, the conditional updates never fire, the row remains a valid host-titled item with the link attached — which is the designed outcome, not an error state. Microlink's free tier (50 req/day) stays the documented escape hatch if roll-your-own disappoints across the board | Per research: Amazon's 2026 anti-bot stack is unbeatable without infrastructure disproportionate to a family app |
| SSRF posture | http(s)-only via `safeHttpUrl`; Workers egress cannot reach private/internal ranges; fetched bytes are parsed for specific attributes and re-escaped by JSX — never rendered as markup; images are content-type-checked and re-served from R2, not proxied live | The fetcher only ever runs on an authenticated owner's own pasted URL |

## New pieces

- `src/lib/metadata.ts` — `fetchMetadata(url, fetcher = fetch)`: returns `{ title?, imageUrl?, price? }`. The injectable `fetcher` is the test seam (vitest 4 removed `fetchMock`; tests pass a stub returning fixture `Response`s).
- `src/lib/images.ts` — `storeItemImage(env, itemId, imageUrl, fetcher)`: validates, downloads, writes to R2, returns the key. Same seam.
- Route `GET /img/:key` — streams from R2 (404 on miss), immutable caching, `X-Robots-Tag: noindex`.
- Route `GET /items/:id.json` — owner-scoped, returns `{ title, note, price, url, imageKey }`; powers the settle-in poll.
- `POST /lists/:id/items` gains the `waitUntil(enrichItem(...))` call after the redirect is prepared.
- `wrangler.jsonc`: `r2_buckets` binding. Bucket created once via `wrangler r2 bucket create wishlist-images` (**note: R2 may need one-time enablement in the dashboard — possibly a user step**).
- Migration 0004: `items.image_key TEXT` (additive; applied to prod before merge per the standing rule).
- Client sprinkle: the autofill poll + value-swap with dirty tracking (still no spinners, no skeletons, no animations beyond a ≤200ms swap transition).

## Tests

- **Parser unit tests** (fixture HTML via stub Responses): og-complete page; twitter-only page; title-tag-only; JSON-LD price; broken/absent price; malformed JSON-LD; non-HTML content-type refused; >500 KB truncation still parses earlier tags; relative `og:image` resolved against the page URL.
- **Enrichment integration** (real workerd, stub fetcher): paste URL → row created with host title → enrichment fills title/price/image_key → owner-edited title is NOT overwritten (fill-if-untouched, each field); fetch failure leaves the row untouched; image with wrong content-type / oversize is skipped while text fields still fill.
- **R2 round-trip**: stored object serves at `/img/:key` with immutable headers; unknown key 404s; giver page renders `/img/…` when `image_key` set, falls back to `image_url`, and the no-photo box still works.
- **items/:id.json**: owner-scoped 404 for other users; shape stable.
- **Cleanup**: deleting an item removes its R2 objects (best-effort assertion).

## Definition of done (roadmap exit criteria, concrete)

1. Pasting a typical shop URL on production yields a filled card (title, price when detectable, R2-served photo) within a few seconds — verified with 2–3 real NZ shop URLs.
2. Pasting an Amazon URL yields a clean host-titled item with the link attached — no error surfaced anywhere.
3. Images serve from `/img/…` (our copy), survive the source URL 404ing, and the network tab shows no requests to merchant domains on the giver page.
4. `pnpm check` + smoke green; Codex review + fixes; visual spot-check that the settle-in moment respects the no-spinner rule.
5. Migration 0004 + R2 bucket live in prod before merge.

## Explicitly out of scope

Edge caching (Phase 4) · PWA/theme (Phase 4) · re-fetch on link edit, "fetch again" button (parked) · price tracking (never, per brief) · Microlink integration (documented escape hatch only) · image resizing/optimization (Cloudflare Images is a later nicety; originals are fine at family scale).
