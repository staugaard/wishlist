# Phase 2 spec — the owner's workbench

*Written 2026-08-13. Scope per `../roadmap.md` Phase 2: sign in, tend your lists — the full owner loop with manual item entry. Out of scope here: URL auto-fill (Phase 3), images (Phase 3), edge caching/PWA/theme toggle (Phase 4).*

## Decisions settled by this spec

| Question | Decision | Why |
|---|---|---|
| Reorder on mobile (flagged by roadmap) | **Move up/down actions, server-rendered, zero JS** — the `⋮⋮` grip stays as the visual affordance per the design; real drag-and-drop is a parked fast-follow | Drag needs a JS library and pointer-event care across phone/desktop; up/down works identically everywhere at family list sizes. Deliberate, documented deviation from the handoff's drag interaction — visuals unchanged |
| Editor expansion | **Server round-trip**: the open row is URL state (`?item=:id`), the editor is a form, Done submits and redirects | The handoff explicitly allows this ("server round-trip is acceptable"); keeps Phase 2 at ~zero client JS with phone/desktop identical |
| Client JS (total) | One sprinkle: **copy-share-link** via `navigator.clipboard`, inline "Copied" for ~2s (no toast), with a select-the-text fallback | Everything else is HTML forms |
| Email sender | Resend raw `fetch`, key in `.dev.vars` / `wrangler secret put`. **Until the custom domain lands (Phase 5), Resend can only deliver to the account owner's own address** (resend.dev sender). Dev/tests: when `RESEND_API_KEY` is unset, the code is logged instead of emailed | Fine for Phase 2's real user count (you); family onboarding is Phase 5 anyway, right after the domain |
| Adding owners | No invite UI. A new family member = one documented `wrangler d1 execute` insert into `users` | Invite flows are ceremony we don't need at 2–15 known people; revisit at Phase 5 |
| Signed-in home | `GET /` renders the owner home ("Your lists") when a session exists, else the Phase 1 placeholder plus a quiet "Sign in" link | The design has no marketing page and doesn't want one |

## Schema (migrations 0002 + 0003 — two-step to avoid the drizzle rename prompt)

1. **0002**: `DROP TABLE app_meta` — generate this *first* (the schema already lacks it, so `db:generate` emits a clean DROP with no new tables in the same diff). Queued since Phase 1 (expand–contract); prod code stopped reading it in Phase 1.
2. **0003**: `otp_codes` — generate after adding to the schema:

```
otp_codes  email TEXT PK (lowercase — one active code per address)
           code_hash TEXT NOT NULL      -- SHA-256 of "<email>:<code>"
           expires_at INTEGER NOT NULL  -- 10 minutes from issue
           attempts INTEGER NOT NULL DEFAULT 0
           created_at INTEGER NOT NULL
```

`users`, `sessions`, `lists`, `items` are unchanged.

## Auth — hand-rolled passwordless email code (per the roadmap decision)

**Request a code — `POST /login`** (form: email)
- Normalize email to lowercase. If a `users` row exists: generate a 6-digit code via `crypto.getRandomValues`, upsert `otp_codes` (replacing any prior code for that email, attempts reset), send the email (subject "Your Hinted sign-in code: NNNNNN", plain text).
- **Identical response whether or not the email exists** ("If that address is on the family list, a code is on its way") — no user enumeration, even at family scale.
- Rate limit: 3 sends / 10 min per email (Cloudflare rate-limiting binding keyed on the email hash; D1 counter fallback if the binding disappoints). Also cap on IP if the binding makes it cheap.

**Verify — `POST /login/verify`** (form: email + code)
- Look up by email; reject if expired or `attempts >= 5` (then delete the row). Increment `attempts` *before* comparing. Compare `SHA-256("<email>:<code>")` against `code_hash` with `timingSafeEqual` from `node:crypto` (Workers runtime extension).
- On success, atomically: delete the `otp_codes` row + insert a `sessions` row (id = 32 random bytes, base64url) — single-use enforced in the same batch (`db.batch`).
- Set cookie: `session=<id>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7776000` (90 days). Sliding renewal: when a valid session has <30 days left, middleware extends it.

**Middleware `requireOwner`** — reads the cookie, loads the session+user (one joined query), attaches to context; missing/expired → redirect `/login`. Expired sessions are deleted lazily on touch.

**`POST /logout`** — deletes the session row, clears the cookie.

**CSRF/origin**: all mutating routes require a same-origin `Origin` (or `Sec-Fetch-Site: same-origin`) header — cheap belt-and-suspenders on top of `SameSite=Lax`. No token machinery.

**Login pages** (`GET /login`, the verify step): same visual voice — wordmark, one field, one primary button, copy per the handoff's tone ("What's your email?" → "Check your email — we sent a six-digit code").

## Routes

| Route | What |
|---|---|
| `GET /` | Owner home when signed in (design §Screens 2: "Your lists", ListRows with meta lines, "Start a new list"); placeholder + sign-in link otherwise |
| `POST /lists` | Create (name from a small form on the home page) → redirect to the editor |
| `GET /lists/:id` | The editor (design §Screens 3): desktop = 274px `ListNav` sidebar + main column; phone = stacked, no sidebar. Paste bar sticky on top, list header with "Copy share link" (outline), item rows. `?item=:itemId` renders that row as the in-place `ItemEditor` (one at a time; the title input gets `autofocus`) |
| `POST /lists/:id` | Rename / occasion label / intro |
| `POST /lists/:id/delete` | Delete after an explicit confirm page (no JS confirm dialogs) |
| `POST /lists/:id/items` | Paste-bar submit: if the input parses as an http(s) URL → item with `title = hostname`, `url = input` (Phase 3 upgrades this into the auto-fill moment); otherwise `title = input`. Either way redirect with the new row's editor open |
| `POST /items/:id` | Update title/note/price/url/priority (the editor's Done) → redirect to the closed list |
| `POST /items/:id/delete` | Remove (the editor's quiet underlined Remove) |
| `POST /items/:id/move` | `direction=up\|down` — swap `position` with the neighbor, server-rendered |

All `/lists/*` and `/items/*` routes are owner-scoped: **every query filters by the session user's ownership** (join through `lists.user_id`), 404 on misses (not 403 — don't confirm existence). Slugs are generated at list creation: 16 random bytes → base64url (the `newSlug()` helper this phase adds).

## Components to port (from `docs/design/hinted/components.md`)

`ListRow`, `ListNav`, `PasteBar`, `ItemRow` (grip is decorative this phase; `···` menu deferred — Remove lives in the editor), `ItemEditor` (uncontrolled inputs inside a real `<form>`). The Phase-2 CSS is already in `src/styles.css`; expected additions are limited to small layout glue (two-column desktop shell, breakpoint ~900px) and the move-up/down affordance styled within the tokens.

## Copy voice (handoff rules apply)

"Nothing here yet — paste a link to get started." · "Copied" (inline, 2s) · list meta: "5 things · shared with 6 people" becomes "5 things" until share-tracking exists — write what's true: "5 things · 12 March" (occasion label + date only if set). Never an exclamation mark.

## Tests

- **Auth**: known email → code path works end-to-end (dev-mode logged code); unknown email → identical response body; wrong code ×5 → code invalidated; expired code rejected; session cookie flags; logout kills the session; sliding renewal extends.
- **Authz**: user B cannot `GET/POST` user A's list or items (404); unauthenticated mutation → redirect; missing/foreign Origin header on POST → rejected.
- **CRUD**: create list (slug format `^[A-Za-z0-9_-]{22}$`), rename, delete cascade removes items; paste-bar URL input vs plain text; item update/remove; move up/down incl. boundary no-ops.
- **Rendering**: home lists in position order with meta lines; editor opens the right row; public page reflects owner edits immediately.
- **Schema**: `app_meta` is gone.
- Smoke: sign-in flow is *not* smoke-tested (needs email); smoke keeps hitting the public page + healthz.

## Definition of done

1. Migrations 0002+0003 applied local + prod (additive/drop ordering per the roadmap rule).
2. You can sign in on your phone via an emailed code, create a list, build it by hand (add, edit, note, price, priority, reorder, remove), copy the share link, and open the public URL — all on production.
3. A second seeded family member can sign in (dev-verified) and **cannot** see or edit your lists.
4. `pnpm check` + smoke green; the tests above exist and pass; Codex review + visual verification of the three owner screens (home, editor phone, editor desktop) against the mockups.
5. Zero client JS except the copy-link sprinkle; no animations, toasts, or spinners.

## Explicitly out of scope

URL metadata fetch (Phase 3) · images/R2 (Phase 3) · edge caching, PWA, theme toggle (Phase 4) · drag-and-drop reorder, list reordering, `···` row menu (parked) · invite UI, "shared with N people" tracking, account settings, email change (parked).
