#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

LIMIT=150000
MAIN_DOC="ARCHITECTURE.md"

# Per-file budgets (#1354): CLAUDE.md/ARCHITECTURE.md auto-load into every session; the
# scoped CLAUDE.mds load whenever their area is touched. Regrowth is a per-turn tax — fail CI.
BUDGETS=(
  "ARCHITECTURE.md:20000"
  "CLAUDE.md:10000"
  "scripts/CLAUDE.md:10000"
  "e2e/CLAUDE.md:14000"
  "src/components/ui/CLAUDE.md:8000"
)

main_size=$(wc -m < "$MAIN_DOC")

fail=0
while IFS= read -r sub; do
  sub_size=$(wc -m < "$sub")
  total=$((main_size + sub_size))
  if [ "$total" -ge "$LIMIT" ]; then
    echo "FAIL: $MAIN_DOC ($main_size) + $sub ($sub_size) = $total >= $LIMIT" >&2
    fail=1
  else
    echo "OK: $MAIN_DOC ($main_size) + $sub ($sub_size) = $total < $LIMIT"
  fi
done < <(find docs/architecture -name '*.md' | sort)

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
