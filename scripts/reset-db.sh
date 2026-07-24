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

DEV_EMAIL="$(parse_var DEV_EMAIL || true)"
DEV_NAME="$(parse_var DEV_NAME || true)"
NEXT_PUBLIC_SUPABASE_URL="$(parse_var NEXT_PUBLIC_SUPABASE_URL || true)"
SUPABASE_SERVICE_ROLE_KEY="$(parse_var SUPABASE_SERVICE_ROLE_KEY || true)"
DEV_SUPABASE_URL="$(parse_var DEV_SUPABASE_URL || true)"
DEV_BARN="$(parse_var DEV_BARN || true)"
DEV_BARN="${DEV_BARN:-dev-barn}"

for var_name in DEV_EMAIL DEV_NAME NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY DEV_SUPABASE_URL; do
  if [ -z "${!var_name}" ]; then
    echo "Error: $var_name is not set in .env.local" >&2
    exit 1
  fi
done

NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  DEV_SUPABASE_URL="$DEV_SUPABASE_URL" \
  npx tsx scripts/reset-db.ts

bash scripts/seed-account.sh

echo ""
echo "Open the invite path printed above on your Vercel preview to claim the manager account."
printf "Press Enter when logged in, or Escape to skip role selection: "
IFS= read -rsn1 key || true
echo ""

if [ "$key" = $'\e' ]; then
  exit 0
fi

# Assumes the default barn slug was accepted at seed-account.sh's prompt above — if you
# typed a different slug there, run `bash scripts/change-user.sh <slug>` yourself instead.
bash scripts/change-user.sh "$DEV_BARN"
