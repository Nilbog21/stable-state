#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/teardown-test-barn.sh"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# Creates a temp git repo with a stubbed npx that logs its args and the env vars
# teardown-test-barn.sh is expected to pass through.
make_repo() {
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/bin"
  cat > "$dir/bin/npx" <<'NPXEOF'
#!/usr/bin/env bash
{
  printf 'args=%s\n' "$*"
  printf 'TEST_BARN_SLUG=%s\n' "${TEST_BARN_SLUG:-}"
  printf 'TEARDOWN_ALL=%s\n' "${TEARDOWN_ALL:-}"
} >> "$NPX_LOG"
NPXEOF
  chmod +x "$dir/bin/npx"
  echo "$dir"
}

write_env_local() {
  local dir="$1"
  {
    echo "NEXT_PUBLIC_SUPABASE_URL=https://dev.supabase.co"
    echo "SUPABASE_SERVICE_ROLE_KEY=service-role-key"
    echo "DEV_SUPABASE_URL=https://dev.supabase.co"
  } > "$dir/.env.local"
}

# Test 1: no slug, no --all — exits non-zero, npx never invoked
REPO="$(make_repo)"
write_env_local "$REPO"
NPX_LOG="$REPO/npx.log"
err_output="$(cd "$REPO" && NPX_LOG="$NPX_LOG" PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -qi "barn slug" && [ ! -f "$NPX_LOG" ]; then
  assert_pass "no slug, no --all: non-zero exit, clear error, npx not invoked"
else
  assert_fail "no slug, no --all: non-zero exit, clear error, npx not invoked" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 2: slug given — invokes npx with slug, TEARDOWN_ALL=false
REPO="$(make_repo)"
write_env_local "$REPO"
NPX_LOG="$REPO/npx.log"
(cd "$REPO" && NPX_LOG="$NPX_LOG" PATH="$REPO/bin:$PATH" bash "$SCRIPT" some-slug >/dev/null 2>&1) || true
if grep -q "^TEST_BARN_SLUG=some-slug$" "$NPX_LOG" 2>/dev/null && grep -q "^TEARDOWN_ALL=false$" "$NPX_LOG" 2>/dev/null; then
  assert_pass "slug given: invokes npx with slug, TEARDOWN_ALL=false"
else
  assert_fail "slug given: invokes npx with slug, TEARDOWN_ALL=false" "log: $(cat "$NPX_LOG" 2>/dev/null)"
fi
rm -rf "$REPO"

# Test 3: --all given, no slug required — invokes npx with TEARDOWN_ALL=true, empty slug
REPO="$(make_repo)"
write_env_local "$REPO"
NPX_LOG="$REPO/npx.log"
(cd "$REPO" && NPX_LOG="$NPX_LOG" PATH="$REPO/bin:$PATH" bash "$SCRIPT" --all >/dev/null 2>&1) || true
if grep -q "^TEARDOWN_ALL=true$" "$NPX_LOG" 2>/dev/null && grep -q "^TEST_BARN_SLUG=$" "$NPX_LOG" 2>/dev/null; then
  assert_pass "--all given: invokes npx with TEARDOWN_ALL=true, no slug required"
else
  assert_fail "--all given: invokes npx with TEARDOWN_ALL=true, no slug required" "log: $(cat "$NPX_LOG" 2>/dev/null)"
fi
rm -rf "$REPO"

# Test 4: --allow-prod then --all — both flags parsed together
REPO="$(make_repo)"
write_env_local "$REPO"
NPX_LOG="$REPO/npx.log"
(cd "$REPO" && NPX_LOG="$NPX_LOG" PATH="$REPO/bin:$PATH" bash "$SCRIPT" --allow-prod --all >/dev/null 2>&1) || true
if grep -q "^TEARDOWN_ALL=true$" "$NPX_LOG" 2>/dev/null; then
  assert_pass "--allow-prod --all: both flags parsed, npx invoked"
else
  assert_fail "--allow-prod --all: both flags parsed, npx invoked" "log: $(cat "$NPX_LOG" 2>/dev/null)"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
