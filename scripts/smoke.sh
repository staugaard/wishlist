#!/usr/bin/env bash
# Smoke test: boots the real dev server (workerd via the Cloudflare Vite
# plugin), hits the routes, and fails loudly. Designed for agents: one
# command, deterministic exit code, logs on failure.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${SMOKE_PORT:-8788}"
LOG="$(mktemp "${TMPDIR:-/tmp}/wishlist-smoke.XXXXXX")"

pnpm db:migrate:local >/dev/null
pnpm db:seed >/dev/null
DEMO_SLUG="demolist0000000000000A"

pnpm exec vite dev --port "$PORT" --strictPort >"$LOG" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 120); do
  if curl -sf "http://localhost:$PORT/healthz" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "smoke FAIL: dev server exited early" >&2
    cat "$LOG" >&2
    exit 1
  fi
  sleep 0.5
done

fail() {
  echo "smoke FAIL: $1" >&2
  cat "$LOG" >&2
  exit 1
}

curl -sf "http://localhost:$PORT/" | grep -q "hn-wordmark" || fail "home page did not render"
curl -sf "http://localhost:$PORT/healthz" | grep -q '"status":"ok"' || fail "healthz not ok"
curl -sf "http://localhost:$PORT/healthz" | grep -q '"db":"ok"' || fail "db round-trip failed"
DEMO_HTML="$(curl -sf "http://localhost:$PORT/l/$DEMO_SLUG")" || fail "demo list request failed"
for title in "Wool socks, any colour" "Cast iron skillet, 26 cm" "Speckled ceramic mug" "A poetry collection" "Gardening gloves"; do
  echo "$DEMO_HTML" | grep -q "$title" || fail "demo list missing item: $title"
done
curl -s "http://localhost:$PORT/l/nope00000000000000000x" | grep -q "This list isn" || fail "404 page did not render"
curl -sf "http://localhost:$PORT/login" | grep -q "What&#39;s your email?" || fail "login page did not render"

echo "smoke OK (/, /healthz, demo list, 404, D1 round-trip)"
