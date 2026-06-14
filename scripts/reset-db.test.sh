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

# Creates a temp git repo with an optional .env.local and a stubbed node binary.
# env_content: contents to write to .env.local (empty string = no file created)
# node_exit: exit code for the node stub
make_repo() {
  local env_content="${1:-}"
  local node_exit="${2:-0}"
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/scripts" "$dir/bin"

  cat > "$dir/bin/node" <<NODEEOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$dir/node.log"
exit $node_exit
NODEEOF
  chmod +x "$dir/bin/node"

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

# Tests 5–6: all vars present (shared Arrange + Act)
# Arrange
REPO="$(make_repo "DEV_MANAGER_EMAIL=manager@dev.local
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
# Act
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?

# Test 5: should_exit_zero_when_all_required_vars_present
# Assert
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_exit_zero_when_all_required_vars_present"
else
  assert_fail "should_exit_zero_when_all_required_vars_present" "script exited non-zero ($exit_code)"
fi

# Test 6: should_invoke_node_when_all_required_vars_present
# Assert
if [ -f "$REPO/node.log" ]; then
  assert_pass "should_invoke_node_when_all_required_vars_present"
else
  assert_fail "should_invoke_node_when_all_required_vars_present" "node was not called"
fi
rm -rf "$REPO"

# --- Pure JS functions ---

# Test 7: should_return_25_dates_from_buildLessonDates
# Arrange
NOW="2024-06-15T10:00:00.000Z"
# Act + Assert
node -e "
const { buildLessonDates } = require('$SCRIPT_DIR/reset-db.js');
const dates = buildLessonDates(new Date('$NOW'));
if (dates.length !== 25) { process.stderr.write('expected 25, got ' + dates.length + '\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_return_25_dates_from_buildLessonDates"
else
  assert_fail "should_return_25_dates_from_buildLessonDates" "buildLessonDates did not return 25 dates"
fi

# Test 8: should_bucket_dates_into_older_recent_and_future_groups
# Arrange
NOW="2024-06-15T10:00:00.000Z"
# Act + Assert
node -e "
const { buildLessonDates } = require('$SCRIPT_DIR/reset-db.js');
const now = new Date('$NOW');
const dates = buildLessonDates(now);
const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const older = dates.slice(0, 10);
const recent = dates.slice(10, 20);
const future = dates.slice(20, 25);
if (!older.every(d => d < sevenDaysAgo)) { process.stderr.write('older bucket has dates within past week\n'); process.exit(1); }
if (!recent.every(d => d >= sevenDaysAgo && d < now)) { process.stderr.write('recent bucket out of expected range\n'); process.exit(1); }
if (!future.every(d => d > now)) { process.stderr.write('future bucket has past dates\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_bucket_dates_into_older_recent_and_future_groups"
else
  assert_fail "should_bucket_dates_into_older_recent_and_future_groups" "date buckets out of expected range"
fi

# Test 9: should_throw_with_label_when_mustSucceed_receives_error
# Act + Assert
node -e "
const { mustSucceed } = require('$SCRIPT_DIR/reset-db.js');
try {
  mustSucceed({ error: { message: 'boom' }, data: null }, 'test-label');
  process.stderr.write('expected throw\n');
  process.exit(1);
} catch (e) {
  if (!e.message.includes('test-label: boom')) { process.stderr.write('wrong message: ' + e.message + '\n'); process.exit(1); }
}
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_throw_with_label_when_mustSucceed_receives_error"
else
  assert_fail "should_throw_with_label_when_mustSucceed_receives_error" "mustSucceed did not throw with correct label:message"
fi

# Test 10: should_return_data_when_mustSucceed_receives_success
# Act + Assert
node -e "
const { mustSucceed } = require('$SCRIPT_DIR/reset-db.js');
const result = mustSucceed({ error: null, data: [1, 2, 3] }, 'test-label');
if (!Array.isArray(result) || result.length !== 3) { process.stderr.write('wrong result\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_return_data_when_mustSucceed_receives_success"
else
  assert_fail "should_return_data_when_mustSucceed_receives_success" "mustSucceed did not return data"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
