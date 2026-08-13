# Phase 1 spec — the public list page

*Written 2026-08-13. Scope per `../roadmap.md` Phase 1: real schema, the Hinted design system rendered by real code, and the giver page live on production. No owner UI, no auth UI, no scraping.*

## Decisions settled by this spec

| Question | Decision | Why |
|---|---|---|
| Slug format | 16 random bytes (`crypto.getRandomValues`) → base64url, 22 chars, at `/l/:slug` | 128 bits is unguessable at any realistic probe rate; base64url is copy-paste-safe; `/l/` keeps the root namespace free for owner routes later |
| Fonts | **Self-host** Newsreader + Hanken Grotesk as variable woff2 static assets, `font-display: swap`, immutable cache headers | The handoff flags the Google Fonts request as the slowest thing on an otherwise edge-rendered page; self-hosting also removes the only third-party request in the whole app (privacy) |
| CSS delivery | One global stylesheet `src/styles.css` (ported tokens + component classes), loaded via the Vite `<Link>` helper; no per-route CSS | The whole design system is a few KB; splitting it is complexity with no payoff |
| Dark theme | Tokens duplicated under `@media (prefers-color-scheme: dark)` guarded with `:root:not([data-theme="light"])`, plus the handoff's `[data-theme="dark"]` block | System preference works with zero JS in Phase 1; the manual toggle (Phase 4) just sets `data-theme` and already wins in both directions |
| `app_meta` | Retire. New migration drops it; `/healthz` now counts `lists` instead | It existed only to prove the migration loop; real tables prove it better |
| `sessions` table | Created now (with `users`) even though auth lands in Phase 2 | Five lines now; keeps Phase 2 a pure-code change on an already-migrated schema |

## Schema (migration 0001)

```
users     id INTEGER PK · email TEXT UNIQUE NOT NULL (stored lowercase)
          name TEXT NOT NULL · created_at INTEGER NOT NULL
sessions  id TEXT PK (opaque random) · user_id → users ON DELETE CASCADE
          expires_at INTEGER NOT NULL · created_at INTEGER NOT NULL
lists     id INTEGER PK · user_id → users ON DELETE CASCADE
          name TEXT NOT NULL · occasion_label TEXT · intro TEXT
          slug TEXT UNIQUE NOT NULL · position INTEGER NOT NULL DEFAULT 0
          created_at / updated_at INTEGER NOT NULL
items     id INTEGER PK · list_id → lists ON DELETE CASCADE
          title TEXT NOT NULL · note TEXT · price TEXT · url TEXT
          image_url TEXT · priority INTEGER NOT NULL DEFAULT 0
          position INTEGER NOT NULL DEFAULT 0
          created_at / updated_at INTEGER NOT NULL
plus: DROP TABLE app_meta
indexes: items(list_id, position) · lists(user_id, position) · sessions(user_id)
```

Notes: `price` is display text ("About 649 kr"), never numeric. `intro` is the owner's line under the list name ("A few things I'd love…"). `image_url` is an external URL in Phase 1; Phase 3 will add R2-backed storage (likely an `image_key` column) — hotlinking is a known-temporary state. Timestamps are unix seconds via Drizzle's `{ mode: "timestamp" }`.

## Design-system port (`src/styles.css` + `src/components/`)

Port from `docs/design/hinted/styles.css` **verbatim where possible** — tokens, `.hn-*` classes — with two changes: the font `@import` is replaced by self-hosted `@font-face` rules, and the dark-theme block gains the `prefers-color-scheme` variant described above. Delete nothing; unported classes (editor, rows, nav, paste bar) stay in the file ready for Phase 2.

Components ported to Hono JSX under `src/components/` (from `docs/design/hinted/components.md`, `className` → `class`, no event props — these are server-rendered and Phase 1 has no interactivity):

- `Wordmark` — as spec'd (name "Hinted", accent italic on index 1)
- `ItemPhoto` — **two** states only: `src` → `<img loading="lazy">` cropped to height; no src → dashed empty box. The `mockLabel` striped placeholder is design-time only and is not ported.
- `PriorityStamp`, `NoteTag`, `Button` (`outline`/`primary`/`full`, renders `<a>` with `href`) — as spec'd
- `ItemCard` — the showpiece; exact structure and optionality rules from the handoff (finished-looking with any combination of photo/price/note/url missing)

CTA `href` is emitted only when the stored URL parses as `http:`/`https:` (guards `javascript:` etc.; Hono JSX handles text escaping).

## Routes

- **`GET /l/:slug`** — the giver page, exactly per handoff §Screens 1: top bar (Wordmark 21px + "Shared by {owner first name}" label), header (list name 44px + `intro` at 17px), dashed rule, card column (18px gap), closing line. Closing copy: *"{Name} keeps this list up to date. Nothing you do here is recorded — sort out who gives what in the family chat, as always."* Items ordered by `position`. `<title>` is "{List name} · Hinted". Unknown slug → 404 page.
- **404 page** — same visual voice: bar with wordmark, "This list isn't here." + one quiet line ("Check the link you were sent — it has to match exactly."). Status 404.
- **`GET /`** — placeholder in the same voice: wordmark, one line ("A place for family wishlists."), nothing else. Real home is Phase 2.
- **`GET /healthz`** — stays; DB probe becomes `SELECT count(*) FROM lists`.

Response headers: `X-Robots-Tag: noindex` on `/l/*` (public ≠ searchable); no caching headers yet (edge caching is Phase 4 — correctness first).

## Seed data

`scripts/seed.sql` replaced with the demo list from the mockups (owner "Sofie", list "Sofie's birthday", the five items — wool socks with note + priority + no photo, cast-iron skillet with price + URL, mug, poetry collection, gardening gloves), with a fixed slug (`demo0000000000000000ok`-style constant) so tests, smoke, and docs can reference it. `pnpm db:seed` stays the local path; prod demo seeding is a one-off `wrangler d1 execute wishlist-db --remote --file=./scripts/seed.sql` (idempotent: `INSERT OR REPLACE` / `ON CONFLICT` throughout).

## Tests

- `/l/:slug`: 200 with all five item titles in order; 404 on unknown slug; note/priority/CTA render only when present; item title containing `<script>` is escaped; `javascript:` URL in `url` produces no CTA link; owner first name appears in bar and closing line.
- `/healthz`: ok against the new schema.
- Smoke script gains a check of the seeded list URL.

## Definition of done (= roadmap exit criteria, made concrete)

1. Migration 0001 applied local + remote; seed applied; `app_meta` gone.
2. The demo list renders at `https://wishlist.staugaard.workers.dev/l/<demo-slug>` matching `mockups/hinted-screens.html` giver screen — verified on a real phone, light and dark.
3. Fonts load from our origin (no `fonts.googleapis.com` request in the network tab).
4. `pnpm check` and `pnpm smoke` green; the new tests exist and pass.
5. No interactivity, no animations, no loading states — per the handoff's "do not add" list.

## Explicitly out of scope

Owner pages, auth, item CRUD, URL unfurling, R2, edge caching, PWA, theme toggle, custom domain.
