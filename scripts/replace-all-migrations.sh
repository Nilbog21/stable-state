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
# ref derived from DEV_SUPABASE_URL in .env.local — see #684, where
# .env.local was once left pointed at prod by accident.
#
# CAVEAT: "wipes the ENTIRE schema and all data" is true for user-created
# entities (per Supabase's own docs: reset "identif[ies] and drop[s] all user
# created entities"), but NOT for pre-existing rows in platform-managed
# tables like storage.buckets — those aren't dropped, just left in place.
# baseline_schema.sql's `INSERT INTO storage.buckets ... ('documents', ...)`
# then collides with the still-existing 'documents' bucket row on replay
# (duplicate key on buckets_pkey). This script pre-clears that bucket (and
# its objects) before resetting, so the replay's INSERT succeeds fresh.
# storage.objects/buckets also reject direct SQL DELETE (storage.protect_delete()
# trigger — "Use the Storage API instead"), so the pre-clear goes through the
# Storage REST API with the service role key, not `supabase db query`.
#
# NOTE: this script is dev-only by design (see above) — prod never gets a
# wholesale reset. When release-3 merges, prod gets a plain forward
# `supabase db push`: none of release3_*.sql has ever touched prod (release-3
# hasn't merged yet), so there's nothing to reconcile — it's a normal
# not-yet-applied-migration push, same as any feature branch's migrations.
# repair-migration-history.sh isn't needed for this; that script is for when
# a migration's *content* already ran on prod under a different filename.
#
# Run from an up-to-date main checkout — this replays whatever migration
# files are on disk right now, so a stale branch means a stale replay.
#
# Note on #930: its service-role auth-gap fix (originally its own migration,
# 20260715133018_fix_relay_rpc_service_role_gap.sql) was rolled into the
# release-3 squash's release3_functions.sql/release3_rls.sql instead of
# staying a standalone file (see #658). stable-state-dev's *current* remote
# migration history still has that 20260715133018 entry from before the
# squash — after this script runs, `migration list` will show it gone. That's
# expected: the fix is baked into the 4-file squash, not lost. Don't take its
# disappearance from the post-reset list as a regression.
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

DEV_SUPABASE_URL="$( { grep -m1 '^DEV_SUPABASE_URL=' .env.local || true; } | cut -d= -f2- | sed 's/[[:space:]]*#.*$//;s/^"//;s/"$//')"
if [ -z "$DEV_SUPABASE_URL" ]; then
  echo "Error: DEV_SUPABASE_URL is not set in .env.local" >&2
  exit 1
fi

SERVICE_ROLE_KEY="$( { grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' .env.local || true; } | cut -d= -f2- | sed 's/[[:space:]]*#.*$//;s/^"//;s/"$//')"
if [ -z "$SERVICE_ROLE_KEY" ]; then
  echo "Error: SUPABASE_SERVICE_ROLE_KEY is not set in .env.local" >&2
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

echo "Clearing the 'documents' storage bucket (not touched by db reset --linked)..."
# storage.objects/buckets reject direct SQL DELETE (protect_delete trigger) —
# must go through the Storage REST API. 404s (bucket already gone/empty) are
# expected and harmless, hence `|| true`.
run curl -sf -X POST "$DEV_SUPABASE_URL/storage/v1/bucket/documents/empty" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" -o /dev/null || true
run curl -sf -X DELETE "$DEV_SUPABASE_URL/storage/v1/bucket/documents" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" -o /dev/null || true

echo "Resetting $LINKED_REF to the current supabase/migrations/ set (schema only, no reseed)..."
# --yes here skips the Supabase CLI's own confirmation prompt — the typed-ref
# confirmation above is the only human checkpoint left once this runs for real.
run npx supabase db reset --linked --no-seed --yes

if $DRY_RUN; then
  echo
  echo "Dry run only. Re-run with --yes after confirming you're linked to the right project:"
  echo "  npx supabase migration list   # sanity check before AND after"
fi
