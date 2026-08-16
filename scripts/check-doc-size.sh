#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

LIMIT=150000

# Pairwise anchor:sub-doc caps. An auto-loaded doc that delegates detail to sub-docs gets one
# entry per sub-doc path; that path may be a directory (every *.md beneath it is paired
# separately) or a single file, so an anchor splitting into loose files carries one row each
# (e2e/CLAUDE.md, below). This is a backstop against one doc going enormous, not a per-turn diet — the
# per-file budgets below are what hold the per-turn cost down.
PAIRS=(
  "ARCHITECTURE.md:docs/architecture"
  "e2e/CLAUDE.md:docs/e2e-framework-facts.md"
  "e2e/CLAUDE.md:docs/e2e-spec-maintenance.md"
)

# Per-file budgets (#1354): CLAUDE.md/ARCHITECTURE.md auto-load into every session; the
# scoped CLAUDE.mds load whenever their area is touched. Regrowth is a per-turn tax — fail CI.
#
# A budget is set from the file's actual size plus a small margin, and is **lowered** when the
# file shrinks — banking the slack is how #1354's 14000 (set when the file was 10081) got spent
# in two days. A raise carries its reason on the line.
BUDGETS=(
  # Raised from 20000 by #1511, which moved /overnightRefactor and /overnightRefactorWrapup into
  # .claude/commands/ and added them to the Workflow skills index: 19937 -> 20257. Two genuinely
  # new skills entering the index, not elaboration of an existing entry — the raise the e2e/CLAUDE.md
  # note below calls legitimate. The file was at 63 characters of headroom, so no trim was available.
  "ARCHITECTURE.md:20500"
  # Lowered from 12500 by #1468, which moved Schema/RLS/RPC verification and Barn Data Backup to
  # supabase/CLAUDE.md and Workflow Skills to .claude/commands/CLAUDE.md, and compressed the
  # sections restating a rule stated in full in the doc they point at: 10009 -> 6237. The 12500 was
  # #1439's unblock after #1436's Test-First carve-out left release/release-4 red for three merges,
  # and it promised this trim. Ceiling: never above 10000, the pre-#1439 value.
  "CLAUDE.md:6500"
  # Raised from 9300 by #1542: 9287 -> 9632. Two genuinely new scripts entering the index
  # (check-ceremony-tags, and a .test.sh for workflow-context), plus one line noting why the
  # latter isn't an exception to the no-.test.sh-for-shell policy stated just above it. New
  # index entries, not elaboration of existing ones — the legitimate-raise case the
  # e2e/CLAUDE.md note below describes. The file was at 13 characters of headroom, so no trim
  # was available; the rationale for both scripts lives in docs/scripts.md, not here.
  "scripts/CLAUDE.md:9750"
  # Lowered from 15500 by #1420, which split the framework facts out to
  # docs/e2e-framework-facts.md, and again from 7400 by #1433, which split the spec-maintenance
  # rules out to docs/e2e-spec-maintenance.md; prior raises (#1354 to 14000, #1409 to 15500) each
  # restored headroom the file spent within days. #1434 then raised it to 6900 for two legitimate
  # index entries, leaving 32 characters. #1468 lowered it to 6150 by capping every index entry at
  # one line — headline, [full] link, issue refs — since both sub-docs already carry the
  # elaboration: 6868 -> 5831. Ceiling: never above 6600, the pre-#1434 value.
  #
  # This index is append-only by design (a fact's number is cited from 29 files, so no number ever
  # moves), so it grows with every fact and no fixed cap survives that: a raise accompanying a
  # genuinely new fact is legitimate. An entry that elaborates rather than points is not — that is
  # what spent the last two raises, and it belongs in the sub-doc.
  "e2e/CLAUDE.md:6150"
  # Both added by #1468 alongside the sections moved out of root CLAUDE.md, sized the same way.
  "supabase/CLAUDE.md:2550"
  ".claude/commands/CLAUDE.md:1450"
  # Lowered from 8000 by #1468: the file is 5145 and had been banking 2855 (55% slack).
  "src/components/ui/CLAUDE.md:5400"
)

fail=0
for pair in "${PAIRS[@]}"; do
  anchor="${pair%:*}"
  sub_path="${pair#*:}"
  anchor_size=$(wc -m < "$anchor")
  while IFS= read -r sub; do
    sub_size=$(wc -m < "$sub")
    total=$((anchor_size + sub_size))
    if [ "$total" -ge "$LIMIT" ]; then
      echo "FAIL: $anchor ($anchor_size) + $sub ($sub_size) = $total >= $LIMIT" >&2
      fail=1
    else
      echo "OK: $anchor ($anchor_size) + $sub ($sub_size) = $total < $LIMIT"
    fi
  done < <(find "$sub_path" -name '*.md' | sort)
done

for entry in "${BUDGETS[@]}"; do
  file="${entry%:*}"
  budget="${entry#*:}"
  size=$(wc -m < "$file")
  if [ "$size" -ge "$budget" ]; then
    echo "FAIL: $file ($size) >= budget $budget" >&2
    fail=1
  else
    echo "OK: $file ($size) < budget $budget"
  fi
done

exit $fail
