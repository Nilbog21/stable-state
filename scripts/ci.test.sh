#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/ci.sh"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# Creates a temp dir with stub scripts and a stubbed npm.
# Stubs log calls to npm.log, coverage.log, and coverage-test.log respectively.
# Exit codes for each stub are controlled by arguments: lint_exit npm_exit coverage_exit coverage_test_exit.
# lint_exit applies when npm is called with "run lint" (or "run lint" plus extra args); npm_exit applies to all other npm calls.
make_repo() {
  local lint_exit="${1:-0}"
  local npm_exit="${2:-0}"
  local coverage_exit="${3:-0}"
  local coverage_test_exit="${4:-0}"
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/scripts" "$dir/bin"

  cat > "$dir/bin/npm" <<NPMEOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$dir/npm.log"
case "\$*" in
  "run lint"*) exit $lint_exit ;;
esac
exit $npm_exit
NPMEOF
  chmod +x "$dir/bin/npm"

  cat > "$dir/scripts/check-coverage.sh" <<COVEOF
#!/usr/bin/env bash
printf 'SKIP_COVERAGE_RUN=%s\n' "\${SKIP_COVERAGE_RUN:-}" >> "$dir/coverage.log"
exit $coverage_exit
COVEOF
  chmod +x "$dir/scripts/check-coverage.sh"

  cat > "$dir/scripts/check-coverage.test.sh" <<COVTEOF
#!/usr/bin/env bash
printf 'called\n' >> "$dir/coverage-test.log"
exit $coverage_test_exit
COVTEOF
  chmod +x "$dir/scripts/check-coverage.test.sh"

  echo "$dir"
}

# Test 1: all steps pass — ci.sh exits 0, lint runs before test:coverage, all steps called, SKIP_COVERAGE_RUN=1 passed
REPO="$(make_repo 0 0 0 0)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?
skip_val="$(grep 'SKIP_COVERAGE_RUN=' "$REPO/coverage.log" 2>/dev/null | head -1 | cut -d= -f2)"
first_npm_call="$(head -1 "$REPO/npm.log" 2>/dev/null)"
case "$first_npm_call" in
  "run lint"*) first_npm_call_is_lint=1 ;;
  *) first_npm_call_is_lint=0 ;;
esac
if [ "$exit_code" -eq 0 ] && [ "$first_npm_call_is_lint" -eq 1 ] && [ -f "$REPO/coverage.log" ] && [ -f "$REPO/coverage-test.log" ] && [ "$skip_val" = "1" ]; then
  assert_pass "all steps pass: exits 0, lint runs first, all steps run, SKIP_COVERAGE_RUN=1 passed"
elif [ "$exit_code" -ne 0 ]; then
  assert_fail "all steps pass: exits 0, lint runs first, all steps run, SKIP_COVERAGE_RUN=1 passed" "ci.sh exited non-zero ($exit_code)"
elif [ "$first_npm_call_is_lint" -ne 1 ]; then
  assert_fail "all steps pass: exits 0, lint runs first, all steps run, SKIP_COVERAGE_RUN=1 passed" "first npm call was not 'run lint' (got '$first_npm_call')"
elif [ "$skip_val" != "1" ]; then
  assert_fail "all steps pass: exits 0, lint runs first, all steps run, SKIP_COVERAGE_RUN=1 passed" "SKIP_COVERAGE_RUN not set to 1 (got '$skip_val')"
else
  assert_fail "all steps pass: exits 0, lint runs first, all steps run, SKIP_COVERAGE_RUN=1 passed" "one or more steps were not called"
fi
rm -rf "$REPO"

# Test 2: lint fails — ci.sh exits non-zero, test:coverage and coverage scripts not called
REPO="$(make_repo 1 0 0 0)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?
npm_lines="$(wc -l < "$REPO/npm.log" 2>/dev/null || echo 0)"
if [ "$exit_code" -ne 0 ] && [ "$npm_lines" -eq 1 ] && [ ! -f "$REPO/coverage.log" ] && [ ! -f "$REPO/coverage-test.log" ]; then
  assert_pass "lint fails: exits non-zero, test:coverage and coverage scripts not called"
elif [ "$exit_code" -eq 0 ]; then
  assert_fail "lint fails: exits non-zero, test:coverage and coverage scripts not called" "ci.sh exited 0 (expected non-zero)"
elif [ "$npm_lines" -ne 1 ]; then
  assert_fail "lint fails: exits non-zero, test:coverage and coverage scripts not called" "test:coverage was unexpectedly called"
elif [ -f "$REPO/coverage.log" ]; then
  assert_fail "lint fails: exits non-zero, test:coverage and coverage scripts not called" "check-coverage.sh was unexpectedly called"
else
  assert_fail "lint fails: exits non-zero, test:coverage and coverage scripts not called" "check-coverage.test.sh was unexpectedly called"
fi
rm -rf "$REPO"

# Test 3: test:coverage fails — ci.sh exits non-zero, coverage scripts not called
REPO="$(make_repo 0 1 0 0)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?
if [ "$exit_code" -ne 0 ] && [ -f "$REPO/npm.log" ] && [ ! -f "$REPO/coverage.log" ] && [ ! -f "$REPO/coverage-test.log" ]; then
  assert_pass "test:coverage fails: exits non-zero, coverage scripts not called"
elif [ "$exit_code" -eq 0 ]; then
  assert_fail "test:coverage fails: exits non-zero, coverage scripts not called" "ci.sh exited 0 (expected non-zero)"
elif [ ! -f "$REPO/npm.log" ]; then
  assert_fail "test:coverage fails: exits non-zero, coverage scripts not called" "npm was not called"
elif [ -f "$REPO/coverage.log" ]; then
  assert_fail "test:coverage fails: exits non-zero, coverage scripts not called" "check-coverage.sh was unexpectedly called"
else
  assert_fail "test:coverage fails: exits non-zero, coverage scripts not called" "check-coverage.test.sh was unexpectedly called"
fi
rm -rf "$REPO"

# Test 4: check-coverage.sh fails — ci.sh exits non-zero, check-coverage.test.sh not called
REPO="$(make_repo 0 0 1 0)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?
if [ "$exit_code" -ne 0 ] && [ -f "$REPO/coverage.log" ] && [ ! -f "$REPO/coverage-test.log" ]; then
  assert_pass "check-coverage.sh fails: exits non-zero, check-coverage.test.sh not called"
elif [ "$exit_code" -eq 0 ]; then
  assert_fail "check-coverage.sh fails: exits non-zero, check-coverage.test.sh not called" "ci.sh exited 0 (expected non-zero)"
elif [ ! -f "$REPO/coverage.log" ]; then
  assert_fail "check-coverage.sh fails: exits non-zero, check-coverage.test.sh not called" "check-coverage.sh was not called"
else
  assert_fail "check-coverage.sh fails: exits non-zero, check-coverage.test.sh not called" "check-coverage.test.sh was unexpectedly called"
fi
rm -rf "$REPO"

# Test 5: check-coverage.test.sh fails — ci.sh exits non-zero
REPO="$(make_repo 0 0 0 1)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?
if [ "$exit_code" -ne 0 ] && [ -f "$REPO/coverage-test.log" ]; then
  assert_pass "check-coverage.test.sh fails: exits non-zero"
elif [ "$exit_code" -eq 0 ]; then
  assert_fail "check-coverage.test.sh fails: exits non-zero" "ci.sh exited 0 (expected non-zero)"
else
  assert_fail "check-coverage.test.sh fails: exits non-zero" "check-coverage.test.sh was not called"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
