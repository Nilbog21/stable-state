#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/reset-db.sh"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# Creates a temp git repo with an optional .env.local, a stubbed tsx binary,
# and stub scripts for seed-account.sh and change-user.sh.
# env_content: contents to write to .env.local (empty string = no file created)
# tsx_exit: exit code for the tsx stub
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

  cat > "$dir/scripts/seed-account.sh" <<SEEDEOF
#!/usr/bin/env bash
echo "seed-account.sh called" >> "$dir/seed_account.log"
SEEDEOF
  chmod +x "$dir/scripts/seed-account.sh"

  cat > "$dir/scripts/change-user.sh" <<CHANGEEOF
#!/usr/bin/env bash
echo "change-user.sh called" >> "$dir/change_user.log"
CHANGEEOF
  chmod +x "$dir/scripts/change-user.sh"

  if [ -n "$env_content" ]; then
    printf '%s\n' "$env_content" > "$dir/.env.local"
  fi

  echo "$dir"
}

# --- Shell wrapper: env validation ---

# Test 1: should_error_with_env_local_message_when_env_local_missing
# Arrange
REPO="$(make_repo "" 0)"
# Act
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
# Assert
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q '\.env\.local'; then
  assert_pass "should_error_with_env_local_message_when_env_local_missing"
else
  assert_fail "should_error_with_env_local_message_when_env_local_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 2: should_error_with_DEV_EMAIL_message_when_DEV_EMAIL_missing
# Arrange
REPO="$(make_repo "DEV_NAME=Dev Manager
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
# Act
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
# Assert
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'DEV_EMAIL'; then
  assert_pass "should_error_with_DEV_EMAIL_message_when_DEV_EMAIL_missing"
else
  assert_fail "should_error_with_DEV_EMAIL_message_when_DEV_EMAIL_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 3: should_error_with_DEV_NAME_message_when_DEV_NAME_missing
# Arrange
REPO="$(make_repo "DEV_EMAIL=dev@example.com
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
# Act
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
# Assert
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'DEV_NAME'; then
  assert_pass "should_error_with_DEV_NAME_message_when_DEV_NAME_missing"
else
  assert_fail "should_error_with_DEV_NAME_message_when_DEV_NAME_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 4: should_error_with_SUPABASE_URL_message_when_SUPABASE_URL_missing
# Arrange
REPO="$(make_repo "DEV_EMAIL=dev@example.com
DEV_NAME=Dev Manager
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
# Act
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
# Assert
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'NEXT_PUBLIC_SUPABASE_URL'; then
  assert_pass "should_error_with_SUPABASE_URL_message_when_SUPABASE_URL_missing"
else
  assert_fail "should_error_with_SUPABASE_URL_message_when_SUPABASE_URL_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 5: should_error_with_SERVICE_KEY_message_when_SERVICE_KEY_missing
# Arrange
REPO="$(make_repo "DEV_EMAIL=dev@example.com
DEV_NAME=Dev Manager
NEXT_PUBLIC_SUPABASE_URL=http://localhost" 0)"
# Act
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
# Assert
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'SUPABASE_SERVICE_ROLE_KEY'; then
  assert_pass "should_error_with_SERVICE_KEY_message_when_SERVICE_KEY_missing"
else
  assert_fail "should_error_with_SERVICE_KEY_message_when_SERVICE_KEY_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 6: should_exit_zero_when_all_required_vars_present
# Arrange
REPO="$(make_repo "DEV_EMAIL=dev@example.com
DEV_NAME=Dev Manager
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
# Act (pipe Enter to satisfy keypress prompt)
printf '\n' | (cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?
# Assert
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_exit_zero_when_all_required_vars_present"
else
  assert_fail "should_exit_zero_when_all_required_vars_present" "script exited non-zero ($exit_code)"
fi
rm -rf "$REPO"

# Test 7: should_invoke_tsx_when_all_required_vars_present
# Arrange
REPO="$(make_repo "DEV_EMAIL=dev@example.com
DEV_NAME=Dev Manager
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
# Act
printf '\n' | (cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
# Assert
if [ -f "$REPO/tsx.log" ]; then
  assert_pass "should_invoke_tsx_when_all_required_vars_present"
else
  assert_fail "should_invoke_tsx_when_all_required_vars_present" "tsx was not called"
fi
rm -rf "$REPO"

# Test 8: should_call_seed_account_sh_after_tsx
# Arrange
REPO="$(make_repo "DEV_EMAIL=dev@example.com
DEV_NAME=Dev Manager
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
# Act
printf '\n' | (cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
# Assert
if [ -f "$REPO/seed_account.log" ]; then
  assert_pass "should_call_seed_account_sh_after_tsx"
else
  assert_fail "should_call_seed_account_sh_after_tsx" "seed-account.sh was not called"
fi
rm -rf "$REPO"

# Test 9: should_call_change_user_sh_on_enter
# Arrange
REPO="$(make_repo "DEV_EMAIL=dev@example.com
DEV_NAME=Dev Manager
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
# Act (pipe Enter key)
printf '\n' | (cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
# Assert
if [ -f "$REPO/change_user.log" ]; then
  assert_pass "should_call_change_user_sh_on_enter"
else
  assert_fail "should_call_change_user_sh_on_enter" "change-user.sh was not called on Enter"
fi
rm -rf "$REPO"

# Test 10: should_not_call_change_user_sh_on_escape
# Arrange
REPO="$(make_repo "DEV_EMAIL=dev@example.com
DEV_NAME=Dev Manager
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
# Act (pipe Escape key)
printf '\033' | (cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
# Assert
if [ ! -f "$REPO/change_user.log" ]; then
  assert_pass "should_not_call_change_user_sh_on_escape"
else
  assert_fail "should_not_call_change_user_sh_on_escape" "change-user.sh was called on Escape"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
