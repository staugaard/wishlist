# Wishlist

A simple, beautiful birthday/Christmas wishlist app for family and friends.
Cloudflare Workers + Hono (JSX SSR) + D1 + Drizzle. Scales to zero, deploys in
seconds, costs ~$0/month.

Currently: **scaffolding only** — infrastructure, dev environment, and test
loops. No product features yet. Research and decisions: [`docs/tech-and-hosting-research.md`](docs/tech-and-hosting-research.md).

## Development

```bash
pnpm install
pnpm db:migrate:local   # create/migrate the local D1 (.wrangler/state)
pnpm dev                # http://localhost:5173 — real workerd, HMR
pnpm check              # typecheck + lint + tests — the single gate
pnpm smoke              # boots dev server, curls /, /healthz (D1 round-trip)
```

Working agreements for AI-assisted development are in [CLAUDE.md](CLAUDE.md).

## One-time Cloudflare setup (not done yet)

1. `pnpm exec wrangler login`
2. `pnpm exec wrangler d1 create wishlist-db` → paste the returned
   `database_id` into `wrangler.jsonc`.
3. First deploy: `pnpm deploy`, then `pnpm db:migrate:remote`.
4. Continuous deploys: connect the repo to **Workers Builds** in the
   Cloudflare dashboard (Workers & Pages → wishlist → Settings → Builds):
   - Build command: `pnpm install --frozen-lockfile && pnpm build`
   - Deploy command: `pnpm exec wrangler d1 migrations apply wishlist-db --remote && pnpm exec wrangler deploy`

   Migrations MUST live in the deploy command, not the build command: the
   build command also runs for PR/preview branches, which would apply a PR's
   migrations to the production database. The deploy command only runs for
   the production branch.

   Workers Builds authenticates via its GitHub App — no API tokens in GitHub.
   Every PR branch gets an automatic preview URL; pushes to `main` deploy.
   Rollback code with `wrangler rollback` (migrations are forward-only and are
   NOT rolled back with it). Note: preview versions still bind the production
   D1 (previews skip migrations but share the database) — acceptable at family
   scale; add a separate preview environment/database if that ever changes.

## CI

GitHub Actions runs `pnpm check` on every PR (`.github/workflows/ci.yml`).
Deploys are Workers Builds' job, not CI's — no Cloudflare secrets live in
GitHub.

Production: https://wishlist.staugaard.workers.dev
