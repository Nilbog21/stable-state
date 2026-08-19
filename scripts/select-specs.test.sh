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
  # Non-runtime files sitting inside always-full trees — a doc and a unit test. Neither can
  # change what the running app does, so neither may escalate the run (Tests 16-17).
  mkdir -p "$dir/src/components/ui" && touch "$dir/src/components/ui/CLAUDE.md"
  mkdir -p "$dir/src/lib/db/__tests__" && touch "$dir/src/lib/db/__tests__/types.test.ts"
  touch "$dir/src/app/actions/lessons.ts"
  touch "$dir/src/lib/db/types.ts"
  mkdir -p "$dir/src/app/barns" && touch "$dir/src/app/barns/page.tsx"
  mkdir -p "$dir/supabase/migrations" && touch "$dir/supabase/migrations/20260101000000_x.sql"
  # The two dev scripts Tests 20-21 discriminate between: one governs what every spec is pointed
  # at, the other governs only whether runs serialise.
  mkdir -p "$dir/scripts" && touch "$dir/scripts/run-checklist-suite.sh" "$dir/scripts/e2e-slot.sh"

  git -C "$dir" add -A >/dev/null 2>&1
  echo "$dir"
}

# Runs the selector inside $REPO with the given changed paths on stdin, stdout only.
#
# stderr is dropped rather than merged (#1550): escalation now explains itself there, so a merge
# would fold that sentence into every `mode=full` assertion below. The split is the point — the
# `mode=`/`spec=` lines are the parsed contract, stderr is commentary, and `select_specs_stderr`
# is how the commentary gets asserted. The `--lint` tests redirect for themselves.
select_specs() {
  printf '%s\n' "$@" | (cd "$REPO" && bash "$SCRIPT" 2>/dev/null)
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
# Its own invocation rather than `select_specs`, which appends a newline via printf '%s\n' —
# the missing terminator is the whole subject. stdout only, for the reason on `select_specs`.
out="$(printf 'playwright.config.ts' | (cd "$REPO" && bash "$SCRIPT" 2>/dev/null))"
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
#
# Deliberately a *scoped* path, not the `src/lib/db/types.ts` it used to be: #1550 gave escalation
# its own stderr line, and every `src/lib/**` path is always-full, so the old fixture would assert
# "no stderr" on the one input that now legitimately prints some. The claim under test is unchanged
# — it is about the untracked-path warning, not about escalation.
REPO="$(make_repo)"
err="$(select_specs_stderr 'src/app/barns/page.tsx')"
if [ -z "$err" ]; then
  assert_pass "tracked input path emits no warning"
else
  assert_fail "tracked input path emits no warning" "stderr=$err"
fi
rm -rf "$REPO"

# Test 19: mode=full names the path and glob that forced it, on stderr
# The reason a full run happened was previously nowhere: `mode=full` prints alone, so finding out
# which of the diff's paths escalated meant reading ALWAYS_FULL against the diff by hand. #1550 —
# a docs-only edit under src/components/ ran all 73 specs and the output said only "full".
REPO="$(make_repo)"
err="$(select_specs_stderr 'src/components/ExhaustionBar.tsx')"
if echo "$err" | grep -q 'src/components/ExhaustionBar.tsx' && echo "$err" | grep -q 'src/components/\*\*'; then
  assert_pass "mode=full names its triggering path and glob on stderr"
else
  assert_fail "mode=full names its triggering path and glob on stderr" "stderr=$err"
fi
rm -rf "$REPO"

# The reason's "stderr, never stdout" half needs no test of its own: test 4 reads stdout alone and
# asserts `mode=full` is the whole of it, so a reason line escaping onto stdout fails there.

# Test 16: a markdown doc inside an always-full tree does not escalate the run
# #1550 — ALWAYS_FULL's `src/components/**` is a literal prefix with no extension filter, so
# editing src/components/ui/CLAUDE.md ran all 73 specs to prove a doc had not changed the app.
REPO="$(make_repo)"
out="$(select_specs 'src/components/ui/CLAUDE.md')"
if [ "$out" = "mode=none" ]; then
  assert_pass "doc inside an always-full tree yields mode=none"
else
  assert_fail "doc inside an always-full tree yields mode=none" "output=$out"
fi
rm -rf "$REPO"

# Test 17: a unit test inside an always-full tree does not escalate the run
# Same prefix bug, and the shape every TDD commit in this repo starts as: a vitest file
# exercises the module in-process and cannot change what a browser sees.
REPO="$(make_repo)"
out="$(select_specs 'src/lib/db/__tests__/types.test.ts')"
if [ "$out" = "mode=none" ]; then
  assert_pass "unit test inside an always-full tree yields mode=none"
else
  assert_fail "unit test inside an always-full tree yields mode=none" "output=$out"
fi
rm -rf "$REPO"

# Test 18: the runtime sibling of Test 16's doc still escalates
# The guard on both above — an exclusion that swallowed real component changes would turn
# mode=full off entirely and nobody would notice until a regression shipped.
REPO="$(make_repo)"
out="$(select_specs 'src/components/ui/CLAUDE.md' 'src/components/ExhaustionBar.tsx')"
if [ "$out" = "mode=full" ]; then
  assert_pass "a runtime component alongside a doc still yields mode=full"
else
  assert_fail "a runtime component alongside a doc still yields mode=full" "output=$out"
fi
rm -rf "$REPO"

# Test 20: the suite runner itself is always-full
# #1607 — the selector returned mode=none for a diff that rewrote scripts/run-checklist-suite.sh:
# no ALWAYS_FULL entry carried it and no spec's covers: globs declare scripts/, so the file that
# decides what every spec is pointed at was the one file a change to which ran nothing. #1550's
# "a file that cannot reach a browser cannot be the reason to open one" does not separate it from
# playwright.config.ts, already on this list — and it governs strictly more: the origin every spec
# is given, the env every spec reads, and since #1601 whether a production server exists at all.
REPO="$(make_repo)"
out="$(select_specs 'scripts/run-checklist-suite.sh')"
if [ "$out" = "mode=full" ]; then
  assert_pass "the suite runner yields mode=full"
else
  assert_fail "the suite runner yields mode=full" "output=$out"
fi
rm -rf "$REPO"

# Test 21: the slot semaphore is deliberately NOT always-full
# The guard on Test 20, and the executable form of #1607's recorded exclusion. e2e-slot.sh governs
# whether runs serialise, never what any spec asserts, and it already has e2e-slot.test.sh in
# ci.sh. Without this case "add scripts/ to ALWAYS_FULL" would look like a passing generalisation
# of Test 20.
REPO="$(make_repo)"
out="$(select_specs 'scripts/e2e-slot.sh')"
if [ "$out" = "mode=none" ]; then
  assert_pass "the slot semaphore does not escalate the run"
else
  assert_fail "the slot semaphore does not escalate the run" "output=$out"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
