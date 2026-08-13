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

# Creates a temp git repo with ARCHITECTURE.md, docs/architecture/*.md, a nested
# docs/architecture/dal/lessons.md, the per-file-budgeted CLAUDE.md set, and both of
# e2e/CLAUDE.md's pairwise sub-docs — docs/e2e-framework-facts.md and
# docs/e2e-spec-maintenance.md — at given byte sizes. Every path in the script's PAIRS has to
# exist here: a missing one makes `find` print to stderr and the pair check run zero times, so
# that entry would be silently unexercised by every test below rather than failing one.
make_repo() {
  local main_size="$1" sub_size="$2" budget_file_size="${3:-1000}" nested_size="${4:-100}"
  local facts_size="${5:-100}" spec_maint_size="${6:-100}"
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/docs/architecture/dal" "$dir/scripts" "$dir/e2e" "$dir/src/components/ui" \
    "$dir/supabase" "$dir/.claude/commands"
  head -c "$main_size" /dev/zero | tr '\0' 'a' > "$dir/ARCHITECTURE.md"
  for f in schema dal routes rpc rls; do
    head -c "$sub_size" /dev/zero | tr '\0' 'a' > "$dir/docs/architecture/$f.md"
  done
  head -c "$nested_size" /dev/zero | tr '\0' 'a' > "$dir/docs/architecture/dal/lessons.md"
  head -c "$facts_size" /dev/zero | tr '\0' 'a' > "$dir/docs/e2e-framework-facts.md"
  head -c "$spec_maint_size" /dev/zero | tr '\0' 'a' > "$dir/docs/e2e-spec-maintenance.md"
  for f in CLAUDE.md scripts/CLAUDE.md e2e/CLAUDE.md src/components/ui/CLAUDE.md \
    supabase/CLAUDE.md .claude/commands/CLAUDE.md; do
    head -c "$budget_file_size" /dev/zero | tr '\0' 'a' > "$dir/$f"
  done
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

# Test 4: rls.md participates in the pairwise check — over-limit combined total names it
REPO="$(make_repo 15000 140000)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "docs/architecture/rls.md"; then
  assert_pass "rls.md over pairwise limit: exits non-zero, names rls.md"
else
  assert_fail "rls.md over pairwise limit: exits non-zero, names rls.md" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 5: a file over its per-file budget fails and is named; a file under its own budget is not.
# The pair has been re-anchored twice as the set's ordering moved — on e2e/CLAUDE.md once #1420
# made it the smallest, and now on .claude/commands/CLAUDE.md, which #1468 added at 1450 while
# lowering CLAUDE.md's to 6500. 3000 is over the smallest budget in the set and under the largest
# of the nested ones, testing both directions in one run.
REPO="$(make_repo 15000 5000 3000)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "^FAIL: .claude/commands/CLAUDE.md "; then
  assert_pass ".claude/commands/CLAUDE.md over budget: exits non-zero, names it"
else
  assert_fail ".claude/commands/CLAUDE.md over budget: exits non-zero, names it" "exit=$script_exit output=$err_output"
fi
if echo "$err_output" | grep -q "^FAIL: CLAUDE.md "; then
  assert_fail "CLAUDE.md under its larger budget: not flagged" "was flagged: $err_output"
else
  assert_pass "CLAUDE.md under its larger budget: not flagged"
fi
rm -rf "$REPO"

# Test 6: exactly at a per-file budget boundary — treated as failing (>=), matching the pairwise
# rule. Asserts on the message too: at this size e2e/CLAUDE.md is over its own budget as well, so
# an exit status alone can't tell the boundary rule from that unrelated failure. The size is
# CLAUDE.md's budget and tracks it: #1439 raised that to 12500 and #1468 lowered it to 6500.
REPO="$(make_repo 15000 5000 6500)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "^FAIL: CLAUDE.md "; then
  assert_pass "exactly at per-file budget: treated as failing"
else
  assert_fail "exactly at per-file budget: treated as failing" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 7: ARCHITECTURE.md has its own per-file budget, separate from the pairwise check
REPO="$(make_repo 20000 5000)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "^FAIL: ARCHITECTURE.md "; then
  assert_pass "ARCHITECTURE.md over its own budget: exits non-zero, names it"
else
  assert_fail "ARCHITECTURE.md over its own budget: exits non-zero, names it" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 8: everything under pairwise limit and all per-file budgets — exits 0 (1300 is under the
# smallest budget in the set, which is .claude/commands/CLAUDE.md's 1450 since #1468 added it; this
# size tracks whichever budget is smallest, and has followed it down through #1420, #1433 and #1468)
REPO="$(make_repo 15000 5000 1300)"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "all files under budgets: exits 0"
else
  assert_fail "all files under budgets: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 9: an oversized file nested under docs/architecture/ is discovered — exits
# non-zero and names it (fixed file lists never see files the split adds later)
REPO="$(make_repo 15000 50000 1000 140000)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "docs/architecture/dal/lessons.md"; then
  assert_pass "oversized nested file: discovered and named"
else
  assert_fail "oversized nested file: discovered and named" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 10: the second pairwise anchor (#1420) — e2e/CLAUDE.md + docs/e2e-framework-facts.md over
# the same 150,000 backstop exits non-zero and names the sub-doc. Both files are under their own
# per-file budgets here, so only the pairwise check can produce this failure. Anchored on ^FAIL:
# because the passing OK: line carries the same filename — an unanchored grep would accept an
# unrelated failure elsewhere in the script as evidence this pair was checked at all.
REPO="$(make_repo 15000 5000 1000 100 149000)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "^FAIL: e2e/CLAUDE.md .* docs/e2e-framework-facts.md"; then
  assert_pass "e2e pairwise anchor over limit: exits non-zero, names the sub-doc"
else
  assert_fail "e2e pairwise anchor over limit: exits non-zero, names the sub-doc" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 11: e2e/CLAUDE.md's *second* sub-doc (#1433) is a pair in its own right, not a free rider on
# test 10's. Same anchor, same backstop, so only the spec-maintenance sub-doc is oversized here —
# the facts doc stays at its default 100 and cannot be what produces the failure. Without this,
# adding a PAIRS entry whose file the fixture never creates reads as covered by test 10.
REPO="$(make_repo 15000 5000 1000 100 100 149000)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "^FAIL: e2e/CLAUDE.md .* docs/e2e-spec-maintenance.md"; then
  assert_pass "e2e spec-maintenance pair over limit: exits non-zero, names the sub-doc"
else
  assert_fail "e2e spec-maintenance pair over limit: exits non-zero, names the sub-doc" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
