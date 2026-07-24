#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/change-user.sh"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# Creates a temp git repo with a stubbed npx that logs its args and the env vars
# change-user.sh is expected to pass through.
make_repo() {
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/bin"
  cat > "$dir/bin/npx" <<'NPXEOF'
#!/usr/bin/env bash
{
  printf 'args=%s\n' "$*"
  printf 'CHANGE_USER_ALLOW_PROD=%s\n' "${CHANGE_USER_ALLOW_PROD:-}"
  printf 'CHANGE_USER_BARN_SLUG=%s\n' "${CHANGE_USER_BARN_SLUG:-}"
} >> "$NPX_LOG"
NPXEOF
  chmod +x "$dir/bin/npx"
  echo "$dir"
}

write_env_local() {
  local dir="$1" include_dev_supabase_url="$2"
  {
    echo "DEV_EMAIL=dev@example.com"
    echo "DEV_NAME=Dev Person"
    echo "NEXT_PUBLIC_SUPABASE_URL=https://dev.supabase.co"
    echo "SUPABASE_SERVICE_ROLE_KEY=service-role-key"
    if [ "$include_dev_supabase_url" = "yes" ]; then
      echo "DEV_SUPABASE_URL=https://dev.supabase.co"
    fi
  } > "$dir/.env.local"
}

# Test 1: missing barn slug arg — exits non-zero, clear error, npx never invoked
REPO="$(make_repo)"
write_env_local "$REPO" yes
NPX_LOG="$REPO/npx.log"
err_output="$(cd "$REPO" && NPX_LOG="$NPX_LOG" PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -qi "barn slug" && [ ! -f "$NPX_LOG" ]; then
  assert_pass "missing barn slug: non-zero exit, clear error, npx not invoked"
else
  assert_fail "missing barn slug: non-zero exit, clear error, npx not invoked" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 2: no --allow-prod, DEV_SUPABASE_URL missing — exits non-zero
REPO="$(make_repo)"
write_env_local "$REPO" no
NPX_LOG="$REPO/npx.log"
err_output="$(cd "$REPO" && NPX_LOG="$NPX_LOG" PATH="$REPO/bin:$PATH" bash "$SCRIPT" some-slug 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -qi "DEV_SUPABASE_URL"; then
  assert_pass "no --allow-prod, missing DEV_SUPABASE_URL: non-zero exit, clear error"
else
  assert_fail "no --allow-prod, missing DEV_SUPABASE_URL: non-zero exit, clear error" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 3: no --allow-prod, DEV_SUPABASE_URL present — invokes npx with allow-prod unset/false
REPO="$(make_repo)"
write_env_local "$REPO" yes
NPX_LOG="$REPO/npx.log"
(cd "$REPO" && NPX_LOG="$NPX_LOG" PATH="$REPO/bin:$PATH" bash "$SCRIPT" some-slug >/dev/null 2>&1) || true
if grep -q "^CHANGE_USER_BARN_SLUG=some-slug$" "$NPX_LOG" 2>/dev/null && ! grep -q "^CHANGE_USER_ALLOW_PROD=true$" "$NPX_LOG" 2>/dev/null; then
  assert_pass "no --allow-prod, DEV_SUPABASE_URL present: invokes npx with slug, allow-prod not true"
else
  assert_fail "no --allow-prod, DEV_SUPABASE_URL present: invokes npx with slug, allow-prod not true" "log: $(cat "$NPX_LOG" 2>/dev/null)"
fi
rm -rf "$REPO"

# Test 4: --allow-prod passed, DEV_SUPABASE_URL absent — still invokes npx with allow-prod=true
REPO="$(make_repo)"
write_env_local "$REPO" no
NPX_LOG="$REPO/npx.log"
(cd "$REPO" && NPX_LOG="$NPX_LOG" PATH="$REPO/bin:$PATH" bash "$SCRIPT" --allow-prod some-slug >/dev/null 2>&1) || true
if grep -q "^CHANGE_USER_ALLOW_PROD=true$" "$NPX_LOG" 2>/dev/null && grep -q "^CHANGE_USER_BARN_SLUG=some-slug$" "$NPX_LOG" 2>/dev/null; then
  assert_pass "--allow-prod passed, DEV_SUPABASE_URL absent: invokes npx with allow-prod=true"
else
  assert_fail "--allow-prod passed, DEV_SUPABASE_URL absent: invokes npx with allow-prod=true" "log: $(cat "$NPX_LOG" 2>/dev/null)"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
