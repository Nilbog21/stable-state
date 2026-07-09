#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
DEV_SUPABASE_URL="${DEV_SUPABASE_URL:-}"

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
  SUPABASE_SERVICE_ROLE_KEY="$(parse_var SUPABASE_SERVICE_ROLE_KEY || true)"
  DEV_SUPABASE_URL="$(parse_var DEV_SUPABASE_URL || true)"
fi

for var_name in NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY DEV_SUPABASE_URL; do
  if [ -z "${!var_name}" ]; then
    echo "Error: $var_name is not set" >&2
    exit 1
  fi
done

BARN_SLUG="${1:-}"
if [ -z "$BARN_SLUG" ]; then
  echo "Error: barn slug argument is required (e.g. test-barn-pr-99)" >&2
  exit 1
fi

NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  DEV_SUPABASE_URL="$DEV_SUPABASE_URL" \
  TEST_BARN_SLUG="$BARN_SLUG" \
  npx tsx scripts/seed-test-barn.ts
