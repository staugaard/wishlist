# Runbook

*Operations reference for Hinted (wishlist.season4.app). Written 2026-08-14. Everything here was verified against the real account when written. Deliberately no alerting — `/healthz` exists for manual checks; this is a family app.*

## Quick state check

```bash
curl -s https://wishlist.season4.app/healthz          # {"status":"ok","db":"ok","lists":N}
pnpm exec wrangler deployments list                    # recent code deploys
pnpm exec wrangler d1 time-travel info wishlist-db     # current DB bookmark
```

## Rolling back bad code

Deploys happen on merge to `main` (Workers Builds). To instantly revert the Worker to the previous version:

```bash
pnpm exec wrangler rollback            # picks the last 100%-traffic version
```

Rehearsed 2026-08-14: rolled prod back one version and forward again; ~seconds of transition, database untouched throughout.

**Rollback reverts code only, never the database.** Migrations are forward-only; if a bad migration shipped, code rollback does not undo it — use Time Travel (below) with care, or write a corrective forward migration (usually the right answer).

## Database disaster recovery — D1 Time Travel

Every write is continuously journaled; any point in the last 30 days is restorable. No setup, always on.

```bash
# Find the bookmark for "now" (do this BEFORE risky operations):
pnpm exec wrangler d1 time-travel info wishlist-db

# Restore to a bookmark (REWRITES THE LIVE DB — take a fresh bookmark first
# so the restore itself is reversible):
pnpm exec wrangler d1 time-travel restore wishlist-db --bookmark=<bookmark>

# Or restore to a timestamp:
pnpm exec wrangler d1 time-travel restore wishlist-db --timestamp=<unix|RFC3339>
```

Rehearsed 2026-08-14: bookmark retrieval verified live (restore itself intentionally not executed against prod — the restore path is exercised implicitly by Cloudflare; the dangerous part is choosing to run it, not whether it works).

Note: R2 images are NOT versioned. A DB restore that resurrects deleted items may reference cleaned-up images (cards degrade to the dashed no-photo box — harmless), and orphaned R2 objects cost effectively nothing.

## Adding a family member as an owner (when the day comes)

Two commands + one click for them:

```bash
pnpm exec wrangler d1 execute wishlist-db --remote \
  --command "INSERT INTO users (email, name, created_at) VALUES ('them@example.com', 'Their Name', unixepoch())"
pnpm exec wrangler email routing addresses create them@example.com
```

They click the Cloudflare verification email once; sign-in codes to them are then free forever. (Until then: one owner, family participates as account-less givers via share links — the designed model.)

## Email

- Sender: `hinted@season4.app` via the Email Service `EMAIL` binding — works because **Email Routing is enabled on season4.app** and recipients are **verified destination addresses** (free on any plan). No API keys anywhere.
- If sends fail: check the destination is still verified (dashboard → Email Service → Email Routing → Destination addresses) and that season4.app Email Routing is still enabled (`pnpm exec wrangler email routing settings season4.app`).

## DNS

- The zone lives on Cloudflare (angela/mike.ns.cloudflare.com). Registration stays at Porkbun.
- **Chore (after ~2026-08-16): delete the season4.app DNS zone at Porkbun.** Two bridge A records (`wishlist` → 104.21.83.216 / 172.67.182.48) were added there on 2026-08-14 to cover stale registry-delegation caches; they hardcode Cloudflare edge IPs and must not outlive the transition.

## Costs / limits watch

Everything sits in free tiers: Workers free plan (100k req/day), D1 (5GB), R2 (10GB — enabled with billing confirmation, images ~100-400KB each), Email (verified destinations, quota-exempt). Nothing needs monitoring at family scale; if the app ever grows, Workers Paid at $5/mo lifts every relevant limit at once.
