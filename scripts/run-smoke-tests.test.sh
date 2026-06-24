#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/run-smoke-tests.sh"

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
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/scripts" "$dir/bin"

  cat > "$dir/bin/npx" <<NPXEOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$dir/npx.log"
exit 0
NPXEOF
  chmod +x "$dir/bin/npx"

  cat > "$dir/bin/npm" <<NPMEOF
#!/usr/bin/env bash
printf 'E2E_BASE_URL=%s TEST_BARN_SLUG=%s\n' "\$E2E_BASE_URL" "\$TEST_BARN_SLUG" >> "$dir/npm.log"
exit 0
NPMEOF
  chmod +x "$dir/bin/npm"

  cat > "$dir/scripts/seed-test-barn.sh" <<SEEDEOF
#!/usr/bin/env bash
printf 'slug=%s\n' "\$1" >> "$dir/seed.log"
exit 0
SEEDEOF
  chmod +x "$dir/scripts/seed-test-barn.sh"

  if [ -n "$env_content" ]; then
    printf '%s\n' "$env_content" > "$dir/.env.local"
  fi

  echo "$dir"
}

FULL_ENV="NEXT_PUBLIC_SUPABASE_URL=http://localhost
NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key
VERCEL_AUTOMATION_BYPASS_SECRET=test-bypass"

# Test 1: should_error_with_env_local_message_when_env_local_missing
REPO="$(make_repo)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q '\.env\.local'; then
  assert_pass "should_error_with_env_local_message_when_env_local_missing"
else
  assert_fail "should_error_with_env_local_message_when_env_local_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 2: should_error_with_NEXT_PUBLIC_SUPABASE_URL_message_when_var_missing
REPO="$(make_repo "NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key
VERCEL_AUTOMATION_BYPASS_SECRET=test-bypass")"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'NEXT_PUBLIC_SUPABASE_URL'; then
  assert_pass "should_error_with_NEXT_PUBLIC_SUPABASE_URL_message_when_var_missing"
else
  assert_fail "should_error_with_NEXT_PUBLIC_SUPABASE_URL_message_when_var_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 3: should_error_with_NEXT_PUBLIC_SUPABASE_ANON_KEY_message_when_var_missing
REPO="$(make_repo "NEXT_PUBLIC_SUPABASE_URL=http://localhost
VERCEL_AUTOMATION_BYPASS_SECRET=test-bypass")"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'NEXT_PUBLIC_SUPABASE_ANON_KEY'; then
  assert_pass "should_error_with_NEXT_PUBLIC_SUPABASE_ANON_KEY_message_when_var_missing"
else
  assert_fail "should_error_with_NEXT_PUBLIC_SUPABASE_ANON_KEY_message_when_var_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 4: should_error_with_VERCEL_AUTOMATION_BYPASS_SECRET_message_when_var_missing
REPO="$(make_repo "NEXT_PUBLIC_SUPABASE_URL=http://localhost
NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key")"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'VERCEL_AUTOMATION_BYPASS_SECRET'; then
  assert_pass "should_error_with_VERCEL_AUTOMATION_BYPASS_SECRET_message_when_var_missing"
else
  assert_fail "should_error_with_VERCEL_AUTOMATION_BYPASS_SECRET_message_when_var_missing" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 5: should_use_arg1_as_preview_url_without_prompting
REPO="$(make_repo "$FULL_ENV")"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" "http://preview.example.com" "test-barn" </dev/null >/dev/null 2>&1)
if [ -f "$REPO/npm.log" ] && grep -q 'E2E_BASE_URL=http://preview.example.com' "$REPO/npm.log"; then
  assert_pass "should_use_arg1_as_preview_url_without_prompting"
else
  assert_fail "should_use_arg1_as_preview_url_without_prompting" "npm.log: $(cat "$REPO/npm.log" 2>/dev/null || echo '(missing)')"
fi
rm -rf "$REPO"

# Test 6: should_use_arg2_as_barn_slug_without_prompting
REPO="$(make_repo "$FULL_ENV")"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" "http://preview.example.com" "my-barn" </dev/null >/dev/null 2>&1)
if [ -f "$REPO/seed.log" ] && grep -q 'slug=my-barn' "$REPO/seed.log"; then
  assert_pass "should_use_arg2_as_barn_slug_without_prompting"
else
  assert_fail "should_use_arg2_as_barn_slug_without_prompting" "seed.log: $(cat "$REPO/seed.log" 2>/dev/null || echo '(missing)')"
fi
rm -rf "$REPO"

# Test 7: should_default_url_to_localhost_when_arg1_is_absent
REPO="$(make_repo "$FULL_ENV")"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" "" "test-barn" </dev/null >/dev/null 2>&1)
if [ -f "$REPO/npm.log" ] && grep -q 'E2E_BASE_URL=http://localhost:3000' "$REPO/npm.log"; then
  assert_pass "should_default_url_to_localhost_when_arg1_is_absent"
else
  assert_fail "should_default_url_to_localhost_when_arg1_is_absent" "npm.log: $(cat "$REPO/npm.log" 2>/dev/null || echo '(missing)')"
fi
rm -rf "$REPO"

# Test 8: should_error_when_barn_slug_missing_and_no_stdin
REPO="$(make_repo "$FULL_ENV")"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" "http://preview.example.com" </dev/null 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q 'barn slug is required'; then
  assert_pass "should_error_when_barn_slug_missing_and_no_stdin"
else
  assert_fail "should_error_when_barn_slug_missing_and_no_stdin" "exit=$exit_code output=$output"
fi
rm -rf "$REPO"

# Test 9: should_succeed_without_env_local_when_skip_env_local_check_passed
REPO="$(make_repo)"  # no .env.local
(cd "$REPO" && PATH="$REPO/bin:$PATH" \
  NEXT_PUBLIC_SUPABASE_URL=http://localhost \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key \
  VERCEL_AUTOMATION_BYPASS_SECRET=test-bypass \
  bash "$SCRIPT" --skip-env-local-check "http://preview.example.com" "test-barn" </dev/null >/dev/null 2>&1)
exit_code=$?
if [ "$exit_code" -eq 0 ] && [ -f "$REPO/npm.log" ] && grep -q 'E2E_BASE_URL=http://preview.example.com' "$REPO/npm.log"; then
  assert_pass "should_succeed_without_env_local_when_skip_env_local_check_passed"
else
  assert_fail "should_succeed_without_env_local_when_skip_env_local_check_passed" "exit=$exit_code npm.log: $(cat "$REPO/npm.log" 2>/dev/null || echo '(missing)')"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
