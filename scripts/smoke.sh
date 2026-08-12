#!/usr/bin/env bash
# Smoke test: boots the real dev server (workerd via the Cloudflare Vite
# plugin), hits the routes, and fails loudly. Designed for agents: one
# command, deterministic exit code, logs on failure.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${SMOKE_PORT:-8788}"
LOG="$(mktemp "${TMPDIR:-/tmp}/wishlist-smoke.XXXXXX")"

pnpm db:migrate:local >/dev/null

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

curl -sf "http://localhost:$PORT/" | grep -qi "wishlist" || fail "home page did not render"
curl -sf "http://localhost:$PORT/healthz" | grep -q '"status":"ok"' || fail "healthz not ok"
curl -sf "http://localhost:$PORT/healthz" | grep -q '"db":"ok"' || fail "db round-trip failed"

echo "smoke OK (/, /healthz, D1 round-trip)"
