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

# Creates a temp git repo with an optional .env.local and a stubbed tsx binary.
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
printf 'DEV_TRAINER_EMAIL=%s\n' "\$DEV_TRAINER_EMAIL" >> "$dir/tsx.log"
printf 'DEV_RIDER_EMAIL=%s\n' "\$DEV_RIDER_EMAIL" >> "$dir/tsx.log"
exit $tsx_exit
TSXEOF
  chmod +x "$dir/bin/npx"

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

# Test 2: should_error_with_DEV_MANAGER_EMAIL_message_when_DEV_MANAGER_EMAIL_missing
# Arrange
REPO="$(make_repo "NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
# Act
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
# Assert
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'DEV_MANAGER_EMAIL'; then
  assert_pass "should_error_with_DEV_MANAGER_EMAIL_message_when_DEV_MANAGER_EMAIL_missing"
else
  assert_fail "should_error_with_DEV_MANAGER_EMAIL_message_when_DEV_MANAGER_EMAIL_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 3: should_error_with_SUPABASE_URL_message_when_SUPABASE_URL_missing
# Arrange
REPO="$(make_repo "DEV_MANAGER_EMAIL=manager@dev.local
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

# Test 4: should_error_with_SERVICE_KEY_message_when_SERVICE_KEY_missing
# Arrange
REPO="$(make_repo "DEV_MANAGER_EMAIL=manager@dev.local
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

# Test 5: should_exit_zero_when_all_required_vars_present
# Arrange
REPO="$(make_repo "DEV_MANAGER_EMAIL=manager@dev.local
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
# Act
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?
# Assert
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_exit_zero_when_all_required_vars_present"
else
  assert_fail "should_exit_zero_when_all_required_vars_present" "script exited non-zero ($exit_code)"
fi
rm -rf "$REPO"

# Test 6: should_invoke_tsx_when_all_required_vars_present
# Arrange
REPO="$(make_repo "DEV_MANAGER_EMAIL=manager@dev.local
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
# Act
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
# Assert
if [ -f "$REPO/tsx.log" ]; then
  assert_pass "should_invoke_tsx_when_all_required_vars_present"
else
  assert_fail "should_invoke_tsx_when_all_required_vars_present" "tsx was not called"
fi
rm -rf "$REPO"

# Test 7: should_forward_DEV_TRAINER_EMAIL_to_tsx_when_set
# Arrange
REPO="$(make_repo "DEV_MANAGER_EMAIL=manager@dev.local
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret
DEV_TRAINER_EMAIL=trainer@example.com" 0)"
# Act
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
# Assert
if grep -q 'trainer@example.com' "$REPO/tsx.log" 2>/dev/null; then
  assert_pass "should_forward_DEV_TRAINER_EMAIL_to_tsx_when_set"
else
  assert_fail "should_forward_DEV_TRAINER_EMAIL_to_tsx_when_set" "DEV_TRAINER_EMAIL not found in tsx.log"
fi
rm -rf "$REPO"

# Test 8: should_forward_DEV_RIDER_EMAIL_to_tsx_when_set
# Arrange
REPO="$(make_repo "DEV_MANAGER_EMAIL=manager@dev.local
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret
DEV_RIDER_EMAIL=rider@example.com" 0)"
# Act
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
# Assert
if grep -q 'rider@example.com' "$REPO/tsx.log" 2>/dev/null; then
  assert_pass "should_forward_DEV_RIDER_EMAIL_to_tsx_when_set"
else
  assert_fail "should_forward_DEV_RIDER_EMAIL_to_tsx_when_set" "DEV_RIDER_EMAIL not found in tsx.log"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
