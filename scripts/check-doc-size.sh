#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

LIMIT=150000
MAIN_DOC="ARCHITECTURE.md"

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

exit $fail
