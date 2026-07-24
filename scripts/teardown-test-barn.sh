#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

ALLOW_PROD=false
if [ "${1:-}" = "--allow-prod" ]; then
  ALLOW_PROD=true
  shift
fi

TEARDOWN_ALL=false
if [ "${1:-}" = "--all" ]; then
  TEARDOWN_ALL=true
  shift
fi

NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
DEV_SUPABASE_URL="${DEV_SUPABASE_URL:-}"

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

required_vars="NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY"
if [ "$ALLOW_PROD" = false ]; then
  required_vars="$required_vars DEV_SUPABASE_URL"
fi
for var_name in $required_vars; do
  if [ -z "${!var_name}" ]; then
    echo "Error: $var_name is not set" >&2
    exit 1
  fi
done

BARN_SLUG=""
if [ "$TEARDOWN_ALL" = false ]; then
  BARN_SLUG="${1:-}"
  if [ -z "$BARN_SLUG" ]; then
    echo "Error: barn slug argument is required (e.g. test-barn-pr-99), or pass --all to tear down every test barn" >&2
    exit 1
  fi
fi

NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  DEV_SUPABASE_URL="$DEV_SUPABASE_URL" \
  TEST_BARN_SLUG="$BARN_SLUG" \
  TEARDOWN_TEST_BARN_ALLOW_PROD="$ALLOW_PROD" \
  TEARDOWN_ALL="$TEARDOWN_ALL" \
  npx tsx scripts/teardown-test-barn.ts
