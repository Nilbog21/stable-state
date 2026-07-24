#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

ALLOW_PROD=false
if [ "${1:-}" = "--allow-prod" ]; then
  ALLOW_PROD=true
  shift
fi

if [ ! -f ".env.local" ]; then
  echo "Error: .env.local not found. Copy .env.example to .env.local and fill in values." >&2
  exit 1
fi

parse_var() {
  grep -m1 "^$1=" .env.local | cut -d= -f2- | sed 's/[[:space:]]*#.*$//;s/^"//;s/"$//'
}

DEV_EMAIL="$(parse_var DEV_EMAIL || true)"
DEV_NAME="$(parse_var DEV_NAME || true)"
NEXT_PUBLIC_SUPABASE_URL="$(parse_var NEXT_PUBLIC_SUPABASE_URL || true)"
SUPABASE_SERVICE_ROLE_KEY="$(parse_var SUPABASE_SERVICE_ROLE_KEY || true)"
DEV_SUPABASE_URL="$(parse_var DEV_SUPABASE_URL || true)"

required_vars="DEV_EMAIL DEV_NAME NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY"
if [ "$ALLOW_PROD" = false ]; then
  required_vars="$required_vars DEV_SUPABASE_URL"
fi
for var_name in $required_vars; do
  if [ -z "${!var_name}" ]; then
    echo "Error: $var_name is not set in .env.local" >&2
    exit 1
  fi
done

BARN_SLUG="${1:-}"
if [ -z "$BARN_SLUG" ]; then
  echo "Error: barn slug argument is required (e.g. test-barn-pr-99)" >&2
  exit 1
fi

DEV_EMAIL="$DEV_EMAIL" \
  DEV_NAME="$DEV_NAME" \
  NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  DEV_SUPABASE_URL="$DEV_SUPABASE_URL" \
  CHANGE_USER_ALLOW_PROD="$ALLOW_PROD" \
  CHANGE_USER_BARN_SLUG="$BARN_SLUG" \
  npx tsx scripts/change-user.ts
