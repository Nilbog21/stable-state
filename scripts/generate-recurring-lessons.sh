#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

for var_name in NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
  if [ -z "${!var_name:-}" ]; then
    echo "Error: $var_name is not set" >&2
    exit 1
  fi
done

npx tsx scripts/generate-recurring-lessons.ts
