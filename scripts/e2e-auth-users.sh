#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

usage() {
  cat >&2 <<'EOF'
Usage: e2e-auth-users.sh <create|verify|delete> [--allow-prod]

  create        Create (or password-reset) the three long-lived e2e auth logins
  verify        Exit non-zero naming any that are missing
  delete        Remove them (and their profiles) again
  --allow-prod  Target a non-dev Supabase project
EOF
}

ALLOW_PROD=false
MODE=""
while [ $# -gt 0 ]; do
  case "$1" in
    create|verify|delete)
      MODE="$1"
      shift
      ;;
    --allow-prod)
      ALLOW_PROD=true
      shift
      ;;
    *)
      echo "Error: unknown argument '$1'" >&2
      usage
      exit 1
      ;;
  esac
done

if [ -z "$MODE" ]; then
  echo "Error: mode is required" >&2
  usage
  exit 1
fi

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

NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  DEV_SUPABASE_URL="$DEV_SUPABASE_URL" \
  E2E_AUTH_USERS_MODE="$MODE" \
  E2E_AUTH_USERS_ALLOW_PROD="$ALLOW_PROD" \
  npx tsx scripts/e2e-auth-users.ts
