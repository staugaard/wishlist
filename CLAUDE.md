# Wishlist

A family birthday/Christmas wishlist app on **Cloudflare Workers + Hono (JSX SSR) + D1 + Drizzle**. Currently scaffolding only — no product features yet.

Key documents, in order of authority:
- `docs/design-brief.md` — the product source of truth (what the app is; note: there is deliberately NO claiming/reserving feature)
- `docs/design/hinted/` — the **Hinted** design system handoff (tokens in `styles.css`, component contracts in `components.md`, full-fidelity mockups, and a README with the interaction rules). Match it exactly when building UI; its "do not add" list (no animations, no toasts, no spinners) is binding.
- `docs/tech-and-hosting-research.md` — stack rationale and feature research (superseded by the brief where they disagree)

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server (real workerd via Cloudflare Vite plugin), http://localhost:5173 |
| `pnpm check` | **The gate**: typecheck + lint + tests + production build. Run before declaring any task done. |
| `pnpm test` / `pnpm test:watch` | Vitest in real workerd with an isolated D1 per test file |
| `pnpm smoke` | Boots the dev server, curls `/` and `/healthz` (real D1 round-trip), exits 0/1 |
| `pnpm lint` / `pnpm format` | Biome check / auto-fix (single tool for lint+format) |
| `pnpm db:generate` | Drizzle-kit: diff `src/db/schema.ts` → new SQL migration in `drizzle/` |
| `pnpm db:migrate:local` | Apply migrations to the local dev database (`.wrangler/state`) |
| `pnpm db:migrate:remote` | Apply migrations to production D1 (normally CI's job) |
| `pnpm db:seed` / `pnpm db:reset` | Seed / wipe+remigrate+seed the local dev database |

## Verification loop

1. Make the change.
2. `pnpm check` — must pass.
3. If the change touches routes/rendering: `pnpm smoke` (or curl against a running `pnpm dev`).
4. Schema changes have an extra step — see below.

## Schema changes (two tools, two steps — easy to get wrong)

Drizzle **generates** SQL; wrangler **applies** it. Never confuse the two:

1. Edit `src/db/schema.ts`.
2. `pnpm db:generate` — writes a numbered `.sql` file into `drizzle/`.
3. `pnpm db:migrate:local` — applies it to the local dev DB.
4. `pnpm check` — tests pick up new migrations automatically (`vitest.config.ts` reads `drizzle/` and the setup file applies them to each isolated test DB).

Migrations are **forward-only** (D1 has no down-migrations; `wrangler rollback` reverts Worker code, never schema). Prefer additive/backward-compatible changes.

## Architecture notes (the non-obvious bits)

- `wrangler.jsonc` is the source of truth for bindings. The D1 binding is `DB` (database name `wishlist-db` — migration commands use the *name*, not the binding).
- UI lives in `src/components/` (Hono JSX ports of the design system) and `src/pages/`; all styling is one global `src/styles.css` (the Hinted tokens — don't invent new colors/sizes, use the tokens). Fonts are self-hosted in `public/fonts/` (OFL-licensed; no Google Fonts requests).
- Public list URLs are `/l/:slug` (22-char base64url, unguessable — the URL is the share model) and carry `X-Robots-Tag: noindex`.
- After changing `wrangler.jsonc`, run `pnpm cf-typegen` to regenerate `worker-configuration.d.ts` (gitignored; `pnpm typecheck` also regenerates it).
- The dev server's D1 lives in `.wrangler/state/`. **Tests do NOT share it** — each test file gets a fresh, isolated D1 with migrations applied by `test/apply-migrations.ts`.
- `src/db/index.ts#createDb` constructs Drizzle per request. Never cache DB handles (or any request state) in module scope — Workers isolate reuse is an optimization, not a guarantee.
- JSX is `hono/jsx` (configured in tsconfig) — server-side only. Client JS goes in `src/client.ts`, bundled by Vite, injected via `<Script>` in `src/renderer.tsx`. Client-side HMR is real; server JSX changes are fast full-module reloads.
- Integration tests call `exports.default.fetch(url)` (from `cloudflare:workers`); unit tests use `env` bindings directly. Both run inside real workerd — no mocks for platform APIs.

## Don'ts

- Don't run `pnpm deploy` / `wrangler deploy` unless explicitly asked — deploys are meant to be owned by Cloudflare Workers Builds on push to `main` (see README for setup state).
- Don't hand-edit files in `drizzle/` — always regenerate via `pnpm db:generate`.
- Don't commit `.dev.vars` (local secrets) or `worker-configuration.d.ts` (generated).
- Don't add product features when the task is infrastructure, and vice versa.

## When docs are needed

The Cloudflare docs MCP server is configured in `.mcp.json` — use it for current Wrangler/D1/Workers API details instead of guessing from training data. Any Cloudflare docs page also serves clean Markdown at `<url>/index.md`.
