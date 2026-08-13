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
  "ARCHITECTURE.md:20000"
  # Raised from 10000 by #1439: #1436's Test-First carve-out took the file 9634 -> 10009 and left
  # release/release-4 red for three merges, so this is an unblock, not headroom. The follow-up that
  # trims it back under 10000 lowers this line again — do not spend the 191 characters of margin.
  "CLAUDE.md:10200"
  "scripts/CLAUDE.md:10000"
  # Lowered from 15500 by #1420, which split the framework facts out to
  # docs/e2e-framework-facts.md. Two prior raises (#1354 to 14000, #1409 to 15500) each restored
  # headroom the file then spent within days, and the second left 335 characters — not enough to
  # record the next measured fact in. Splitting is the answer; the number follows the file.
  # Lowered again from 7400 by #1433, which split the spec-maintenance rules out to
  # docs/e2e-spec-maintenance.md — the same shape, one section later. Measured: the split freed
  # 1317 characters and #1433 spent 475 of them on facts 16/17 and their index entries, for a net
  # 7146 -> 6304. The budget follows the file down rather than banking the slack, per the rule above.
  "e2e/CLAUDE.md:6600"
  "src/components/ui/CLAUDE.md:8000"
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
