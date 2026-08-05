#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

LIMIT=150000
MAIN_DOC="ARCHITECTURE.md"

# Per-file budgets for the auto-loaded context set (#1354) — these load into every session
# (or every scripts/-touching session), so regrowth is a per-turn tax and fails CI here.
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
