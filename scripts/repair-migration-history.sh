#!/usr/bin/env bash
# Runbook for #657: reconcile a Supabase project's migration-tracking table
# after the squash to a 3-file baseline (20260629004610/11/12).
#
# Marks the 93 archived migration versions as "reverted" (they no longer
# exist on disk) and the 3 new baseline versions as "applied" (their net
# effect was already applied by the archived migrations, so they must not
# be re-run). Run this against dev first, then prod — link with
# `npx supabase link --project-ref <ref>` before each run (see
# project_supabase_setup memory / README for project refs). Always relink to
# dev afterward.
#
# Run right after this PR merges to main, before anyone runs `supabase db
# push` against either project — otherwise the CLI will see the archived
# files as "missing" and the 3 baseline files as "pending" and try to
# re-apply history that's already live.
#
# Dry-run by default; pass --yes to actually execute.

set -euo pipefail

DRY_RUN=true
[ "${1:-}" = "--yes" ] && DRY_RUN=false

REVERTED_VERSIONS=$(ls "$(dirname "$0")/../supabase/migrations_archive" | sed -E 's/^([0-9]{14})_.*/\1/' | sort)
APPLIED_VERSIONS="20260629004610 20260629004611 20260629004612"

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
