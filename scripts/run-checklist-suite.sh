#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [ ! -f ".env.local" ]; then
  echo "Error: .env.local not found. Copy .env.example to .env.local and fill in values." >&2
  exit 1
fi

parse_var() {
  grep -m1 "^$1=" .env.local | cut -d= -f2- | sed 's/[[:space:]]*#.*$//;s/^"//;s/"$//'
}

NEXT_PUBLIC_SUPABASE_URL="$(parse_var NEXT_PUBLIC_SUPABASE_URL || true)"
NEXT_PUBLIC_SUPABASE_ANON_KEY="$(parse_var NEXT_PUBLIC_SUPABASE_ANON_KEY || true)"

for var_name in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do
  if [ -z "${!var_name}" ]; then
    echo "Error: $var_name is not set in .env.local" >&2
    exit 1
  fi
done

MODE="${1:-interactive}"
if [ "$MODE" != "interactive" ] && [ "$MODE" != "auto" ]; then
  echo "Error: unknown mode '$MODE' (expected 'auto' or no argument)" >&2
  exit 1
fi

BARN_SLUG="e2e-$(date +%s)-$RANDOM"

cleanup() {
  bash scripts/teardown-test-barn.sh "$BARN_SLUG"
}
trap cleanup EXIT

echo "Seeding test barn $BARN_SLUG..."
bash scripts/seed-test-barn.sh "$BARN_SLUG"

echo "Ensuring Playwright browsers are installed..."
npx playwright install --with-deps chromium

PLAYWRIGHT_ARGS=()
if [ "$MODE" = "auto" ]; then
  PLAYWRIGHT_ARGS+=(--grep-invert @visual)
else
  PLAYWRIGHT_ARGS+=(--headed)
fi

NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
E2E_BASE_URL="http://localhost:3000" \
TEST_BARN_SLUG="$BARN_SLUG" \
  npx playwright test "${PLAYWRIGHT_ARGS[@]}"
