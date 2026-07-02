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
SUPABASE_SERVICE_ROLE_KEY="$(parse_var SUPABASE_SERVICE_ROLE_KEY || true)"
DEV_NAME="$(parse_var DEV_NAME || true)"
DEV_BARN="$(parse_var DEV_BARN || true)"
DEV_BARN="${DEV_BARN:-dev-barn}"

for var_name in NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
  if [ -z "${!var_name}" ]; then
    echo "Error: $var_name is not set in .env.local" >&2
    exit 1
  fi
done

default_first="${DEV_NAME%% *}"
if [ "$DEV_NAME" = "$default_first" ]; then
  default_last=""
else
  default_last="${DEV_NAME#* }"
fi

read -r -p "First name${default_first:+ [$default_first]}: " first_input
first="${first_input:-$default_first}"

read -r -p "Last name${default_last:+ [$default_last]}: " last_input
last="${last_input:-$default_last}"

read -r -p "Barn slug${DEV_BARN:+ [$DEV_BARN]}: " slug_input
slug="${slug_input:-$DEV_BARN}"

if [ -z "$first" ]; then echo "Error: first name is required" >&2; exit 1; fi
if [ -z "$last" ]; then echo "Error: last name is required" >&2; exit 1; fi
if [ -z "$slug" ]; then echo "Error: barn slug is required" >&2; exit 1; fi

NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  SEED_FIRST_NAME="$first" \
  SEED_LAST_NAME="$last" \
  SEED_BARN_SLUG="$slug" \
  npx tsx scripts/seed-account.ts
