#!/usr/bin/env bash
# Runbook for #657: reconcile prod's migration-tracking table after the
# squash to a 3-file baseline (20260629004610/11/12).
#
# Marks the 93 archived migration versions as "reverted" (they no longer
# exist on disk) and the 3 new baseline versions as "applied" (their net
# effect was already applied by the archived migrations, so they must not
# be re-run). Link with `npx supabase link --project-ref <ref>` before
# running (see project_supabase_setup memory / README for project refs).
#
# Dev is NOT handled by this script — the shared dev DB gets a wholesale
# schema replacement instead (see #659, scripts/replace-all-migrations.sh).
#
# Run right after this PR merges to main, before anyone runs `supabase db
# push` against prod — otherwise the CLI will see the archived files as
# "missing" and the 3 baseline files as "pending" and try to re-apply
# history that's already live. Disable the `Migrate` GitHub Actions workflow
# before merging so it can't race this script.
#
# Dry-run by default; pass --yes to actually execute.

set -euo pipefail

DRY_RUN=true
[ "${1:-}" = "--yes" ] && DRY_RUN=false

REVERTED_VERSIONS=$(find "$(dirname "$0")/../supabase/migrations_archive" -maxdepth 1 -name '*.sql' -exec basename {} \; | sed -E 's/^([0-9]{14})_.*/\1/' | sort)
APPLIED_VERSIONS="20260629004610 20260629004611 20260629004612"

LINKED_REF_FILE="$(dirname "$0")/../supabase/.temp/project-ref"
if [ ! -f "$LINKED_REF_FILE" ]; then
  echo "No linked Supabase project found. Run 'npx supabase link --project-ref <ref>' first." >&2
  exit 1
fi
LINKED_REF=$(cat "$LINKED_REF_FILE")
echo "Linked project: $LINKED_REF"

if ! $DRY_RUN; then
  read -r -p "Type the project ref above to confirm you want to repair ITS migration history: " CONFIRM_REF
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

echo "Reverting $(echo "$REVERTED_VERSIONS" | wc -l) archived migration versions..."
for v in $REVERTED_VERSIONS; do
  run npx supabase migration repair --status reverted "$v"
done

echo "Marking 3 baseline migration versions as applied..."
for v in $APPLIED_VERSIONS; do
  run npx supabase migration repair --status applied "$v"
done

if $DRY_RUN; then
  echo
  echo "Dry run only. Re-run with --yes after confirming you're linked to the right project:"
  echo "  npx supabase migration list   # sanity check before AND after"
fi
