#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

LIMIT=150000
MAIN_DOC="ARCHITECTURE.md"
SUB_DOCS=(docs/architecture/schema.md docs/architecture/dal.md docs/architecture/routes.md docs/architecture/rpc.md)

main_size=$(wc -c < "$MAIN_DOC")

fail=0
for sub in "${SUB_DOCS[@]}"; do
  sub_size=$(wc -c < "$sub")
  total=$((main_size + sub_size))
  if [ "$total" -ge "$LIMIT" ]; then
    echo "FAIL: $MAIN_DOC ($main_size) + $sub ($sub_size) = $total >= $LIMIT" >&2
    fail=1
  else
    echo "OK: $MAIN_DOC ($main_size) + $sub ($sub_size) = $total < $LIMIT"
  fi
done

exit $fail
