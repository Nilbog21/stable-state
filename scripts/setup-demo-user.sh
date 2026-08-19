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
# Optional, and deliberately not in the required loop below (#1607): when `.env.local` already
# carries a demo password the script keeps it, so a re-run — which `reset-db.sh` now performs on
# every reset — leaves the credential `/demo` and any deployment are already using intact. Absent,
# the TS side mints one and prints it, which is the first-time bootstrap path unchanged.
DEMO_USER_PASSWORD="$(parse_var DEMO_USER_PASSWORD || true)"

if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
  echo "Error: NEXT_PUBLIC_SUPABASE_URL is not set in .env.local" >&2
  exit 1
fi
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Error: SUPABASE_SERVICE_ROLE_KEY is not set in .env.local" >&2
  exit 1
fi

NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  DEMO_USER_PASSWORD="$DEMO_USER_PASSWORD" \
  npx tsx scripts/setup-demo-user.ts
