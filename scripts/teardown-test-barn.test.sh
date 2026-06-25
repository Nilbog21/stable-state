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

make_repo() {
  local env_content="${1:-}"
  local tsx_exit="${2:-0}"
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/scripts" "$dir/bin"

  cat > "$dir/bin/npx" <<NPXEOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$dir/tsx.log"
exit $tsx_exit
NPXEOF
  chmod +x "$dir/bin/npx"

  if [ -n "$env_content" ]; then
    printf '%s\n' "$env_content" > "$dir/.env.local"
  fi

  echo "$dir"
}

ENV_ALL="NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret"

# Test 1: should_error_with_env_local_message_when_env_local_missing
REPO="$(make_repo "" 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" test-barn-pr-99 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q '\.env\.local'; then
  assert_pass "should_error_with_env_local_message_when_env_local_missing"
else
  assert_fail "should_error_with_env_local_message_when_env_local_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 2: should_error_when_SUPABASE_URL_missing
REPO="$(make_repo "SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" test-barn-pr-99 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'NEXT_PUBLIC_SUPABASE_URL'; then
  assert_pass "should_error_when_SUPABASE_URL_missing"
else
  assert_fail "should_error_when_SUPABASE_URL_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 3: should_error_when_SERVICE_KEY_missing
REPO="$(make_repo "NEXT_PUBLIC_SUPABASE_URL=http://localhost" 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" test-barn-pr-99 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'SUPABASE_SERVICE_ROLE_KEY'; then
  assert_pass "should_error_when_SERVICE_KEY_missing"
else
  assert_fail "should_error_when_SERVICE_KEY_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 4: should_error_when_barn_slug_arg_missing
REPO="$(make_repo "$ENV_ALL" 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -iq 'slug\|argument\|barn'; then
  assert_pass "should_error_when_barn_slug_arg_missing"
else
  assert_fail "should_error_when_barn_slug_arg_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 5: should_exit_zero_when_all_required_inputs_present
REPO="$(make_repo "$ENV_ALL" 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" test-barn-pr-99 2>&1)"
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_exit_zero_when_all_required_inputs_present"
else
  assert_fail "should_exit_zero_when_all_required_inputs_present" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 6: should_invoke_tsx_when_all_required_inputs_present
REPO="$(make_repo "$ENV_ALL" 0)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" test-barn-pr-99 >/dev/null 2>&1)
if [ -f "$REPO/tsx.log" ]; then
  assert_pass "should_invoke_tsx_when_all_required_inputs_present"
else
  assert_fail "should_invoke_tsx_when_all_required_inputs_present" "tsx was not called"
fi
rm -rf "$REPO"

# Test 7: should_skip_env_local_check_when_flag_passed
REPO="$(make_repo "" 0)"
# Supply env vars directly (no .env.local) and pass the flag
output="$(cd "$REPO" && NEXT_PUBLIC_SUPABASE_URL=http://localhost SUPABASE_SERVICE_ROLE_KEY=secret PATH="$REPO/bin:$PATH" bash "$SCRIPT" --skip-env-local-check test-barn-pr-99 2>&1)"
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_skip_env_local_check_when_flag_passed"
else
  assert_fail "should_skip_env_local_check_when_flag_passed" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 8: should_error_when_env_vars_missing_even_with_flag
REPO="$(make_repo "" 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" --skip-env-local-check test-barn-pr-99 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'NEXT_PUBLIC_SUPABASE_URL\|SUPABASE_SERVICE_ROLE_KEY'; then
  assert_pass "should_error_when_env_vars_missing_even_with_flag"
else
  assert_fail "should_error_when_env_vars_missing_even_with_flag" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
