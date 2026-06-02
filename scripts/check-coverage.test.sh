#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/check-coverage.sh"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# Creates a temp git repo with a stubbed npm that logs calls and creates a minimal coverage JSON.
make_repo() {
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/coverage" "$dir/bin"
  cat > "$dir/bin/npm" <<NPMEOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$dir/npm.log"
mkdir -p "$dir/coverage"
printf '{}' > "$dir/coverage/coverage-final.json"
NPMEOF
  chmod +x "$dir/bin/npm"
  echo "$dir"
}

# Test 1: default behavior — calls npm run test:coverage
REPO="$(make_repo)"
cd "$REPO"
PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1 || true
if grep -q "run test:coverage" "$REPO/npm.log" 2>/dev/null; then
  assert_pass "default behavior: calls npm run test:coverage"
else
  assert_fail "default behavior: calls npm run test:coverage" "npm.log absent or missing 'run test:coverage'"
fi
rm -rf "$REPO"

# Test 2: SKIP_COVERAGE_RUN=1 with valid JSON — exits 0, npm not called
REPO="$(make_repo)"
cd "$REPO"
printf '{}' > "coverage/coverage-final.json"
if SKIP_COVERAGE_RUN=1 PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1; then
  if [ ! -f "$REPO/npm.log" ]; then
    assert_pass "SKIP_COVERAGE_RUN=1 with valid JSON: exits 0, npm not called"
  else
    assert_fail "SKIP_COVERAGE_RUN=1 with valid JSON: exits 0, npm not called" "npm was still called"
  fi
else
  assert_fail "SKIP_COVERAGE_RUN=1 with valid JSON: exits 0, npm not called" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 3: SKIP_COVERAGE_RUN=1 with missing JSON — exits non-zero, clear error
REPO="$(make_repo)"
cd "$REPO"
err_output="$(SKIP_COVERAGE_RUN=1 PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -qi "coverage-final.json"; then
  assert_pass "SKIP_COVERAGE_RUN=1 with missing JSON: exits non-zero with clear error"
elif [ "$script_exit" -eq 0 ]; then
  assert_fail "SKIP_COVERAGE_RUN=1 with missing JSON: exits non-zero with clear error" "script exited 0 (expected non-zero)"
else
  assert_fail "SKIP_COVERAGE_RUN=1 with missing JSON: exits non-zero with clear error" "exit was non-zero but error message didn't mention coverage-final.json"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
