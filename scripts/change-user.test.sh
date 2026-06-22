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

make_repo() {
  local env_content="${1:-}"
  local tsx_exit="${2:-0}"
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/scripts" "$dir/bin"

  cat > "$dir/bin/npx" <<TSXEOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$dir/tsx.log"
exit $tsx_exit
TSXEOF
  chmod +x "$dir/bin/npx"

  if [ -n "$env_content" ]; then
    printf '%s\n' "$env_content" > "$dir/.env.local"
  fi

  echo "$dir"
}

FULL_ENV="DEV_EMAIL=dev@example.com
DEV_NAME=Dev User
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret"

# Test 1: should_error_with_env_local_message_when_env_local_missing
REPO="$(make_repo "" 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q '\.env\.local'; then
  assert_pass "should_error_with_env_local_message_when_env_local_missing"
else
  assert_fail "should_error_with_env_local_message_when_env_local_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 2: should_error_with_DEV_EMAIL_message_when_DEV_EMAIL_missing
REPO="$(make_repo "DEV_NAME=Dev User
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'DEV_EMAIL'; then
  assert_pass "should_error_with_DEV_EMAIL_message_when_DEV_EMAIL_missing"
else
  assert_fail "should_error_with_DEV_EMAIL_message_when_DEV_EMAIL_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 3: should_error_with_DEV_NAME_message_when_DEV_NAME_missing
REPO="$(make_repo "DEV_EMAIL=dev@example.com
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'DEV_NAME'; then
  assert_pass "should_error_with_DEV_NAME_message_when_DEV_NAME_missing"
else
  assert_fail "should_error_with_DEV_NAME_message_when_DEV_NAME_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 4: should_error_with_SUPABASE_URL_message_when_SUPABASE_URL_missing
REPO="$(make_repo "DEV_EMAIL=dev@example.com
DEV_NAME=Dev User
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'NEXT_PUBLIC_SUPABASE_URL'; then
  assert_pass "should_error_with_SUPABASE_URL_message_when_SUPABASE_URL_missing"
else
  assert_fail "should_error_with_SUPABASE_URL_message_when_SUPABASE_URL_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 5: should_error_with_SERVICE_KEY_message_when_SERVICE_KEY_missing
REPO="$(make_repo "DEV_EMAIL=dev@example.com
DEV_NAME=Dev User
NEXT_PUBLIC_SUPABASE_URL=http://localhost" 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'SUPABASE_SERVICE_ROLE_KEY'; then
  assert_pass "should_error_with_SERVICE_KEY_message_when_SERVICE_KEY_missing"
else
  assert_fail "should_error_with_SERVICE_KEY_message_when_SERVICE_KEY_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 6: should_invoke_tsx_when_all_required_vars_present
REPO="$(make_repo "$FULL_ENV" 0)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
if [ -f "$REPO/tsx.log" ]; then
  assert_pass "should_invoke_tsx_when_all_required_vars_present"
else
  assert_fail "should_invoke_tsx_when_all_required_vars_present" "tsx was not called"
fi
rm -rf "$REPO"

# Test 7: should_exit_zero_when_all_required_vars_present
REPO="$(make_repo "$FULL_ENV" 0)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_exit_zero_when_all_required_vars_present"
else
  assert_fail "should_exit_zero_when_all_required_vars_present" "script exited non-zero ($exit_code)"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
