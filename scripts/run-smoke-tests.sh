#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

SKIP_ENV_LOCAL=false
if [ "${1:-}" = "--skip-env-local-check" ]; then
  SKIP_ENV_LOCAL=true
  shift
fi

if [ "$SKIP_ENV_LOCAL" = false ]; then
  if [ ! -f ".env.local" ]; then
    echo "Error: .env.local not found. Copy .env.example to .env.local and fill in values." >&2
    exit 1
  fi

  parse_var() {
    grep -m1 "^$1=" .env.local | cut -d= -f2- | sed 's/[[:space:]]*#.*$//;s/^"//;s/"$//'
  }

  NEXT_PUBLIC_SUPABASE_URL="$(parse_var NEXT_PUBLIC_SUPABASE_URL || true)"
  NEXT_PUBLIC_SUPABASE_ANON_KEY="$(parse_var NEXT_PUBLIC_SUPABASE_ANON_KEY || true)"
  VERCEL_AUTOMATION_BYPASS_SECRET="$(parse_var VERCEL_AUTOMATION_BYPASS_SECRET || true)"
fi

for var_name in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY VERCEL_AUTOMATION_BYPASS_SECRET; do
  if [ -z "${!var_name}" ]; then
    echo "Error: $var_name is not set" >&2
    exit 1
  fi
done

E2E_BASE_URL="${1:-}"
TEST_BARN_SLUG="${2:-}"

if [ -z "$E2E_BASE_URL" ]; then
  read -r -p "Preview URL (leave blank for http://localhost:3000): " E2E_BASE_URL || true
fi
E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:3000}"

if [ -z "$TEST_BARN_SLUG" ]; then
  read -r -p "Test barn slug: " TEST_BARN_SLUG || true
fi
if [ -z "$TEST_BARN_SLUG" ]; then
  echo "Error: barn slug is required" >&2
  exit 1
fi

echo "Seeding test barn..."
if [ "$SKIP_ENV_LOCAL" = true ]; then
  bash scripts/seed-test-barn.sh --skip-env-local-check "$TEST_BARN_SLUG"
else
  bash scripts/seed-test-barn.sh "$TEST_BARN_SLUG"
fi

echo "Ensuring Playwright browsers are installed..."
npx playwright install --with-deps chromium

NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
VERCEL_AUTOMATION_BYPASS_SECRET="$VERCEL_AUTOMATION_BYPASS_SECRET" \
E2E_BASE_URL="$E2E_BASE_URL" \
TEST_BARN_SLUG="$TEST_BARN_SLUG" \
  npm run test:e2e
