#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/select-specs.sh"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# A temp git repo holding a fixture spec set plus the source paths their globs point at.
# Tracked (`git add -A`), because --lint resolves globs against `git ls-files`.
make_repo() {
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/e2e/support" "$dir/src/app/barn/[slug]/finances" "$dir/src/lib/db" "$dir/src/components/calendar" "$dir/src/app/actions"

  printf '// covers: src/app/barn/[slug]/finances/**\n' > "$dir/e2e/finances.spec.ts"
  # Deliberately not a src/components/ path: those are always-full, so an exact glob there
  # would never be the thing selecting a spec, and Test 2 would be asserting on nothing.
  printf '// covers: src/app/barn/[slug]/NavigationBlocker.tsx\n' > "$dir/e2e/blocker.spec.ts"
  printf '// covers: src/app/barns/**\n' > "$dir/e2e/barns.spec.ts"

  touch "$dir/e2e/global-setup.ts" "$dir/e2e/support/test.ts" "$dir/playwright.config.ts"
  touch "$dir/src/app/barn/[slug]/finances/page.tsx"
  touch "$dir/src/app/barn/[slug]/NavigationBlocker.tsx"
  touch "$dir/src/components/calendar/CalendarDayView.tsx"
  touch "$dir/src/components/ExhaustionBar.tsx"
  touch "$dir/src/app/actions/lessons.ts"
  touch "$dir/src/lib/db/types.ts"
  mkdir -p "$dir/src/app/barns" && touch "$dir/src/app/barns/page.tsx"
  mkdir -p "$dir/supabase/migrations" && touch "$dir/supabase/migrations/20260101000000_x.sql"

  git -C "$dir" add -A >/dev/null 2>&1
  echo "$dir"
}

# Runs the selector inside $REPO with the given changed paths on stdin.
select_specs() {
  printf '%s\n' "$@" | (cd "$REPO" && bash "$SCRIPT" 2>&1)
}

# Same, but stdout discarded — the warnings are the assertion, and merging the two
# streams can't tell "warned about nothing" from "warned about everything".
select_specs_stderr() {
  printf '%s\n' "$@" | (cd "$REPO" && bash "$SCRIPT" 2>&1 >/dev/null)
}

# Test 1: a glob ending /** matches by literal prefix
REPO="$(make_repo)"
out="$(select_specs 'src/app/barns/page.tsx')"
if [ "$out" = "mode=scoped
spec=e2e/barns.spec.ts" ]; then
  assert_pass "prefix glob selects its spec"
else
  assert_fail "prefix glob selects its spec" "output=$out"
fi
rm -rf "$REPO"

# Test 2: a glob with no /** matches the exact path only
REPO="$(make_repo)"
out="$(select_specs 'src/app/barn/[slug]/NavigationBlocker.tsx')"
if [ "$out" = "mode=scoped
spec=e2e/blocker.spec.ts" ]; then
  assert_pass "exact glob selects its spec"
else
  assert_fail "exact glob selects its spec" "output=$out"
fi
rm -rf "$REPO"

# Test 3: [slug] is a literal path segment, not glob metacharacters
REPO="$(make_repo)"
out="$(select_specs 'src/app/barn/[slug]/finances/page.tsx')"
if [ "$out" = "mode=scoped
spec=e2e/finances.spec.ts" ]; then
  assert_pass "bracketed route segment matched literally"
else
  assert_fail "bracketed route segment matched literally" "output=$out"
fi
rm -rf "$REPO"

# Test 4: a path on the always-full list yields mode=full and nothing else
REPO="$(make_repo)"
out="$(select_specs 'e2e/support/test.ts')"
if [ "$out" = "mode=full" ]; then
  assert_pass "always-full path yields mode=full alone"
else
  assert_fail "always-full path yields mode=full alone" "output=$out"
fi
rm -rf "$REPO"

# Test 5: an unmatched path contributes nothing
REPO="$(make_repo)"
out="$(select_specs 'supabase/migrations/20260101000000_x.sql')"
if [ "$out" = "mode=none" ]; then
  assert_pass "unmatched path yields mode=none"
else
  assert_fail "unmatched path yields mode=none" "output=$out"
fi
rm -rf "$REPO"

# Test 6: a changed spec selects itself
REPO="$(make_repo)"
out="$(select_specs 'e2e/barns.spec.ts')"
if [ "$out" = "mode=scoped
spec=e2e/barns.spec.ts" ]; then
  assert_pass "changed spec selects itself"
else
  assert_fail "changed spec selects itself" "output=$out"
fi
rm -rf "$REPO"

# Test 7: --lint passes when every spec declares coverage and every glob resolves
REPO="$(make_repo)"
if (cd "$REPO" && bash "$SCRIPT" --lint >/dev/null 2>&1); then
  assert_pass "lint passes on a fully declared spec set"
else
  assert_fail "lint passes on a fully declared spec set" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 8: --lint fails on a spec with no covers: line, naming it
REPO="$(make_repo)"
printf "import { test } from './support/test'\n" > "$REPO/e2e/undeclared.spec.ts"
git -C "$REPO" add -A >/dev/null 2>&1
out="$(cd "$REPO" && bash "$SCRIPT" --lint 2>&1)" && code=0 || code=$?
if [ "$code" -ne 0 ] && echo "$out" | grep -q "e2e/undeclared.spec.ts"; then
  assert_pass "lint fails on a spec with no covers: line"
else
  assert_fail "lint fails on a spec with no covers: line" "exit=$code output=$out"
fi
rm -rf "$REPO"

# Test 9: --lint fails on a covers: glob matching no tracked path, naming the glob
REPO="$(make_repo)"
printf '// covers: src/app/barn/[slug]/renamed-away/**\n' > "$REPO/e2e/stale.spec.ts"
git -C "$REPO" add -A >/dev/null 2>&1
out="$(cd "$REPO" && bash "$SCRIPT" --lint 2>&1)" && code=0 || code=$?
if [ "$code" -ne 0 ] && echo "$out" | grep -q "src/app/barn/\[slug\]/renamed-away/\*\*"; then
  assert_pass "lint fails on a glob matching nothing"
else
  assert_fail "lint fails on a glob matching nothing" "exit=$code output=$out"
fi
rm -rf "$REPO"

# Test 10: a final path with no trailing newline still counts
# `gh pr diff --name-only` terminates its last line, but a bare `read` loop drops an
# unterminated one — and it drops it toward mode=none, i.e. toward running no e2e.
REPO="$(make_repo)"
out="$(printf 'playwright.config.ts' | (cd "$REPO" && bash "$SCRIPT" 2>&1))"
if [ "$out" = "mode=full" ]; then
  assert_pass "unterminated final line still counts"
else
  assert_fail "unterminated final line still counts" "output=$out"
fi
rm -rf "$REPO"

# Test 11: run outside a git repo, the script stops rather than answering from the wrong tree
# --lint is the dangerous half: ci.sh gates on its exit code, so exiting 0 here would be a
# clean bill of health for a spec set the script never actually read.
out="$(cd / && bash "$SCRIPT" --lint 2>&1)" && code=0 || code=$?
if [ "$code" -ne 0 ]; then
  assert_pass "lint fails outside a git repository"
else
  assert_fail "lint fails outside a git repository" "exit=$code output=$out"
fi

# Test 12: a src/components/ path outside ui/ is always-full
# #1281 — ALWAYS_FULL carried only src/components/ui/**, so a component reached through a
# shared helper (ExhaustionBar via waitForEditFormHydrated) was backstopped by nothing.
REPO="$(make_repo)"
out="$(select_specs 'src/components/ExhaustionBar.tsx')"
if [ "$out" = "mode=full" ]; then
  assert_pass "non-ui component path yields mode=full"
else
  assert_fail "non-ui component path yields mode=full" "output=$out"
fi
rm -rf "$REPO"

# Test 13: a src/app/actions/ path is always-full
REPO="$(make_repo)"
out="$(select_specs 'src/app/actions/lessons.ts')"
if [ "$out" = "mode=full" ]; then
  assert_pass "server action path yields mode=full"
else
  assert_fail "server action path yields mode=full" "output=$out"
fi
rm -rf "$REPO"

# Test 14: an input path matching nothing tracked is named on stderr
# mode=none otherwise reads identically for "no spec declares this" and "this path does not
# exist" — #1207 reported a declared module as undeclared off a typo'd extension.
REPO="$(make_repo)"
err="$(select_specs_stderr 'src/components/Nonexistent.tsx')"
if echo "$err" | grep -q 'src/components/Nonexistent.tsx'; then
  assert_pass "untracked input path warns on stderr"
else
  assert_fail "untracked input path warns on stderr" "stderr=$err"
fi
rm -rf "$REPO"

# Test 15: a tracked input path warns about nothing
# The guard on Test 14 — a warning that fires on every path is worse than no warning.
REPO="$(make_repo)"
err="$(select_specs_stderr 'src/lib/db/types.ts')"
if [ -z "$err" ]; then
  assert_pass "tracked input path emits no warning"
else
  assert_fail "tracked input path emits no warning" "stderr=$err"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
