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
  mkdir -p "$dir/e2e/support" "$dir/src/app/barn/[slug]/finances" "$dir/src/lib/db" "$dir/src/components/calendar"

  printf '// covers: src/app/barn/[slug]/finances/**\n' > "$dir/e2e/finances.spec.ts"
  printf '// covers: src/components/calendar/CalendarDayView.tsx\n' > "$dir/e2e/calendar.spec.ts"
  printf '// covers: src/app/barns/**\n' > "$dir/e2e/barns.spec.ts"

  touch "$dir/e2e/global-setup.ts" "$dir/e2e/support/test.ts" "$dir/playwright.config.ts"
  touch "$dir/src/app/barn/[slug]/finances/page.tsx"
  touch "$dir/src/components/calendar/CalendarDayView.tsx"
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
out="$(select_specs 'src/components/calendar/CalendarDayView.tsx')"
if [ "$out" = "mode=scoped
spec=e2e/calendar.spec.ts" ]; then
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

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
