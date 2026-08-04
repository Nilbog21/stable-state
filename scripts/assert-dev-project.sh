#!/usr/bin/env bash
# Fail-closed guard for `npx supabase db push` — the repo's only schema write, and the only
# destructive path `assertDevProject` (scripts/script-utils.ts) never covered. Called by
# /sync-migrations step 8.
#
# Checks two different things, because `db push` and everything else target the project by
# different means: the CLI writes to whatever `supabase/.temp/project-ref` names (set by
# `npx supabase link`), while every seed/teardown script resolves its project from
# `.env.local`. Verifying only the latter leaves a re-link free to push schema anywhere.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

ALLOW_PROD=false
if [ "${1:-}" = "--allow-prod" ]; then
  ALLOW_PROD=true
  shift
fi

LINKED_REF=""
if [ -f "supabase/.temp/project-ref" ]; then
  LINKED_REF="$(cat supabase/.temp/project-ref)"
fi

if [ "$ALLOW_PROD" = true ]; then
  # Reports the target rather than passing silently — the deliberate-prod operator still has
  # to be able to see which project the push is about to land on.
  echo "--allow-prod: skipping the dev-project check."
  echo "  linked project: ${LINKED_REF:-<none — supabase link has not been run>}"
  exit 0
fi

if [ ! -f ".env.local" ]; then
  echo "ABORT: .env.local not found — cannot verify the push target." >&2
  exit 1
fi

parse_var() {
  grep -m1 "^$1=" .env.local | cut -d= -f2- | sed 's/[[:space:]]*#.*$//;s/^"//;s/"$//'
}

NEXT_PUBLIC_SUPABASE_URL="$(parse_var NEXT_PUBLIC_SUPABASE_URL || true)"
DEV_SUPABASE_URL="$(parse_var DEV_SUPABASE_URL || true)"

if [ -z "$DEV_SUPABASE_URL" ]; then
  echo "ABORT: DEV_SUPABASE_URL is not set in .env.local — refusing to push schema to an unverified project." >&2
  exit 1
fi

if [ "$NEXT_PUBLIC_SUPABASE_URL" != "$DEV_SUPABASE_URL" ]; then
  echo "ABORT: .env.local does not point at the dev project." >&2
  echo "  NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL:-<unset>}" >&2
  echo "  DEV_SUPABASE_URL:         $DEV_SUPABASE_URL" >&2
  echo "Re-run with --allow-prod if this is a deliberate production push." >&2
  exit 1
fi

if [ -z "$LINKED_REF" ]; then
  echo "ABORT: no linked Supabase project (supabase/.temp/project-ref is absent) — run 'npx supabase link' first." >&2
  exit 1
fi

# https://{ref}.supabase.co -> {ref}
DEV_REF="${DEV_SUPABASE_URL#https://}"
DEV_REF="${DEV_REF%%.*}"

if [ "$LINKED_REF" != "$DEV_REF" ]; then
  echo "ABORT: the linked project is not the dev project — 'db push' would write its schema." >&2
  echo "  linked project:   $LINKED_REF" >&2
  echo "  DEV_SUPABASE_URL: $DEV_SUPABASE_URL (ref $DEV_REF)" >&2
  echo "Re-run with --allow-prod if this is a deliberate production push." >&2
  exit 1
fi

echo "OK: linked project $LINKED_REF is the dev project ($DEV_SUPABASE_URL)."
