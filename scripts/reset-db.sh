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

DEV_MANAGER_EMAIL="$(parse_var DEV_MANAGER_EMAIL || true)"
NEXT_PUBLIC_SUPABASE_URL="$(parse_var NEXT_PUBLIC_SUPABASE_URL || true)"
SUPABASE_SERVICE_ROLE_KEY="$(parse_var SUPABASE_SERVICE_ROLE_KEY || true)"
DEV_TRAINER_EMAIL="$(parse_var DEV_TRAINER_EMAIL || true)"
DEV_RIDER_EMAIL="$(parse_var DEV_RIDER_EMAIL || true)"

for var_name in DEV_MANAGER_EMAIL NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
  if [ -z "${!var_name}" ]; then
    echo "Error: $var_name is not set in .env.local" >&2
    exit 1
  fi
done

DEV_MANAGER_EMAIL="$DEV_MANAGER_EMAIL" \
  DEV_TRAINER_EMAIL="$DEV_TRAINER_EMAIL" \
  DEV_RIDER_EMAIL="$DEV_RIDER_EMAIL" \
  NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  npx tsx scripts/reset-db.ts
