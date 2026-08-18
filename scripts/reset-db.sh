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

# reset-db.ts's teardownAllData loops auth.admin.listUsers and deletes *every* auth user, the
# shared demo user included, and nothing re-created it — so before #1607 a reset left /demo
# redirecting to /login?error=demo_unavailable, which reads to a checklist walker as "the demo
# feature is broken" and to a spec as a 30s navigation timeout. Phase 1's own reset-db step
# therefore disarmed Phase 1's /demo checks for the next run.
#
# Prevention rather than detection, but only because #1607 also made it true: setup-demo-user.ts
# used to mint a fresh password on *every* run, so re-creating the user here would have left
# `.env.local` holding a stale credential and /demo failing in exactly the same way. It now reuses
# DEMO_USER_PASSWORD when one is configured, which is what makes this call safe to make
# unconditionally. Run before seed-account.sh so that script's invite path stays the last thing
# printed — the closing line below says "printed above" and means it.
bash scripts/setup-demo-user.sh

bash scripts/seed-account.sh

echo ""
echo "Open the invite path printed above on your Vercel preview to claim the manager account."
