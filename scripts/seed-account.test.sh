#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/seed-account.sh"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# Creates a temp git repo with an optional .env.local and a stubbed npx binary.
# env_content: contents to write to .env.local (empty string = no file created)
# npx_exit: exit code for the npx stub
make_repo() {
  local env_content="${1:-}"
  local npx_exit="${2:-0}"
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/scripts" "$dir/bin"

  cat > "$dir/bin/npx" <<NPXEOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$dir/npx.log"
exit $npx_exit
NPXEOF
  chmod +x "$dir/bin/npx"

  if [ -n "$env_content" ]; then
    printf '%s\n' "$env_content" > "$dir/.env.local"
  fi

  echo "$dir"
}

# --- Shell wrapper: env validation ---

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

# Test 2: should_error_with_SUPABASE_URL_message_when_SUPABASE_URL_missing
REPO="$(make_repo "SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'NEXT_PUBLIC_SUPABASE_URL'; then
  assert_pass "should_error_with_SUPABASE_URL_message_when_SUPABASE_URL_missing"
else
  assert_fail "should_error_with_SUPABASE_URL_message_when_SUPABASE_URL_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 3: should_error_with_SERVICE_KEY_message_when_SERVICE_KEY_missing
REPO="$(make_repo "NEXT_PUBLIC_SUPABASE_URL=http://localhost" 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'SUPABASE_SERVICE_ROLE_KEY'; then
  assert_pass "should_error_with_SERVICE_KEY_message_when_SERVICE_KEY_missing"
else
  assert_fail "should_error_with_SERVICE_KEY_message_when_SERVICE_KEY_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 4: should_exit_zero_when_all_required_and_dev_vars_present
REPO="$(make_repo "NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret
DEV_EMAIL=dev@example.com
DEV_NAME=Jane Doe
DEV_BARN=my-barn" 0)"
printf '\n\n\n\n' | (cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_exit_zero_when_all_required_and_dev_vars_present"
else
  assert_fail "should_exit_zero_when_all_required_and_dev_vars_present" "script exited non-zero ($exit_code)"
fi
rm -rf "$REPO"

# Test 5: should_invoke_npx_when_all_required_and_dev_vars_present
REPO="$(make_repo "NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret
DEV_EMAIL=dev@example.com
DEV_NAME=Jane Doe
DEV_BARN=my-barn" 0)"
printf '\n\n\n\n' | (cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
if [ -f "$REPO/npx.log" ]; then
  assert_pass "should_invoke_npx_when_all_required_and_dev_vars_present"
else
  assert_fail "should_invoke_npx_when_all_required_and_dev_vars_present" "npx was not called"
fi
rm -rf "$REPO"

# Test 6: should_use_DEV_EMAIL_as_default_when_dev_email_set
REPO="$(make_repo "NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret
DEV_EMAIL=default@example.com
DEV_NAME=Jane Doe
DEV_BARN=my-barn" 0)"
printf '\n\n\n\n' | (cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
if grep -q 'default@example.com' "$REPO/npx.log" 2>/dev/null; then
  assert_pass "should_use_DEV_EMAIL_as_default_when_dev_email_set"
else
  assert_fail "should_use_DEV_EMAIL_as_default_when_dev_email_set" "DEV_EMAIL not passed to npx"
fi
rm -rf "$REPO"

# Test 7: should_error_when_email_empty_and_no_DEV_EMAIL
REPO="$(make_repo "NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
output="$(printf '\n\n\n\n' | (cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1))"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'email'; then
  assert_pass "should_error_when_email_empty_and_no_DEV_EMAIL"
else
  assert_fail "should_error_when_email_empty_and_no_DEV_EMAIL" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
