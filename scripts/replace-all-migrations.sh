#!/usr/bin/env bash
# One-time runbook for #659: wholesale-replace stable-state-dev's migration
# history now that the consolidated migration set exists (post the patch-2
# and release-3 squash issues, see #657/#658).
#
# Unlike prod, dev gets torn down and reseeded routinely already, so its
# migration-tracking table doesn't need careful reconciliation (contrast
# with scripts/repair-migration-history.sh, prod's analogous runbook) — it
# can just be wholesale wiped and replayed from the current
# supabase/migrations/ set in one shot via `supabase db reset --linked`.
#
# Schema only — this does NOT reseed data (--no-seed is explicit, though
# there's no supabase/seed.sql in this repo anyway). Run
# scripts/reset-db.sh afterward for a freshly seeded dev account.
#
# SAFETY: `supabase db reset --linked` wipes the ENTIRE schema and all data
# of whatever project the CLI is currently linked to (supabase/.temp/project-ref).
# This script refuses to run unless that linked ref matches the dev project
# ref derived from DEV_SUPABASE_URL in .env.local — see #494, where the CLI
# was once left linked to prod by accident after a forgotten re-link.
#
# Run from an up-to-date main checkout — this replays whatever migration
# files are on disk right now, so a stale branch means a stale replay.
#
# Dry-run by default; pass --yes to actually execute.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

DRY_RUN=true
[ "${1:-}" = "--yes" ] && DRY_RUN=false

# --- Resolve the linked project ref ---
LINKED_REF_FILE="supabase/.temp/project-ref"
if [ ! -f "$LINKED_REF_FILE" ]; then
  echo "No linked Supabase project found. Run 'npx supabase link --project-ref <ref>' first." >&2
  exit 1
fi
LINKED_REF="$(cat "$LINKED_REF_FILE")"
echo "Linked project: $LINKED_REF"

# --- Resolve the expected dev project ref from .env.local ---
if [ ! -f ".env.local" ]; then
  echo "Error: .env.local not found. Copy .env.example to .env.local and fill in values." >&2
  exit 1
fi

DEV_SUPABASE_URL="$(grep -m1 '^DEV_SUPABASE_URL=' .env.local | cut -d= -f2- | sed 's/[[:space:]]*#.*$//;s/^"//;s/"$//')"
if [ -z "$DEV_SUPABASE_URL" ]; then
  echo "Error: DEV_SUPABASE_URL is not set in .env.local" >&2
  exit 1
fi

# https://<ref>.supabase.co -> <ref>
DEV_REF="$(echo "$DEV_SUPABASE_URL" | sed -E 's#^https?://([^.]+)\.supabase\.co/?$#\1#')"
if [ -z "$DEV_REF" ] || [ "$DEV_REF" = "$DEV_SUPABASE_URL" ]; then
  echo "Error: could not extract a project ref from DEV_SUPABASE_URL ($DEV_SUPABASE_URL)" >&2
  exit 1
fi

# --- Refuse to proceed unless the linked project is dev ---
if [ "$LINKED_REF" != "$DEV_REF" ]; then
  echo "Error: linked project ($LINKED_REF) does not match the dev project ref derived from DEV_SUPABASE_URL ($DEV_REF)." >&2
  echo "Refusing to run — this command wipes the ENTIRE linked project. Run 'npx supabase link --project-ref $DEV_REF' first." >&2
  exit 1
fi

if ! $DRY_RUN; then
  read -r -p "Type the project ref above to confirm you want to WIPE its schema and migration history: " CONFIRM_REF
  if [ "$CONFIRM_REF" != "$LINKED_REF" ]; then
    echo "Confirmation did not match linked project ref. Aborting." >&2
    exit 1
  fi
fi

run() {
  if $DRY_RUN; then
    echo "[dry run] $*"
  else
    "$@"
  fi
}

echo "Resetting $LINKED_REF to the current supabase/migrations/ set (schema only, no reseed)..."
run npx supabase db reset --linked --no-seed --yes

if $DRY_RUN; then
  echo
  echo "Dry run only. Re-run with --yes after confirming you're linked to the right project:"
  echo "  npx supabase migration list   # sanity check before AND after"
fi
