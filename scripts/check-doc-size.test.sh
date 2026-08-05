#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/check-doc-size.sh"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# Creates a temp git repo with ARCHITECTURE.md, docs/architecture/*.md, and a nested
# docs/architecture/dal/lessons.md of given byte sizes.
make_repo() {
  local main_size="$1" sub_size="$2" nested_size="${3:-100}"
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/docs/architecture/dal"
  head -c "$main_size" /dev/zero | tr '\0' 'a' > "$dir/ARCHITECTURE.md"
  for f in schema dal routes rpc; do
    head -c "$sub_size" /dev/zero | tr '\0' 'a' > "$dir/docs/architecture/$f.md"
  done
  head -c "$nested_size" /dev/zero | tr '\0' 'a' > "$dir/docs/architecture/dal/lessons.md"
  echo "$dir"
}

# Test 1: all docs comfortably under the limit — exits 0
REPO="$(make_repo 15000 50000)"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "well under limit: exits 0"
else
  assert_fail "well under limit: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 2: one sub-doc's combined total is over the limit — exits non-zero, names the offending file
REPO="$(make_repo 15000 140000)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "docs/architecture/schema.md"; then
  assert_pass "over limit: exits non-zero, names offending file"
else
  assert_fail "over limit: exits non-zero, names offending file" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 3: exactly at the limit boundary — treated as failing (>=), not passing
REPO="$(make_repo 10000 140000)"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_fail "exactly at limit: treated as failing" "script exited 0 (expected non-zero)"
else
  assert_pass "exactly at limit: treated as failing"
fi
rm -rf "$REPO"

# Test 4: an oversized file nested under docs/architecture/ is discovered — exits
# non-zero and names it (fixed file lists never see files the split adds later)
REPO="$(make_repo 15000 50000 140000)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "docs/architecture/dal/lessons.md"; then
  assert_pass "oversized nested file: discovered and named"
else
  assert_fail "oversized nested file: discovered and named" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
