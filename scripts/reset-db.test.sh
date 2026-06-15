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

# Test 6: should_invoke_node_when_all_required_vars_present
# Arrange
REPO="$(make_repo "DEV_MANAGER_EMAIL=manager@dev.local
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
# Act
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
# Assert
if [ -f "$REPO/node.log" ]; then
  assert_pass "should_invoke_node_when_all_required_vars_present"
else
  assert_fail "should_invoke_node_when_all_required_vars_present" "node was not called"
fi
rm -rf "$REPO"

# --- Pure JS functions ---

# Test 7: should_return_34_dates_from_buildLessonDates
# Arrange
NOW="2024-06-15T10:00:00.000Z"
# Act + Assert
node -e "
const { buildLessonDates } = require('$SCRIPT_DIR/reset-db.js');
const dates = buildLessonDates(new Date('$NOW'));
if (dates.length !== 34) { process.stderr.write('expected 34, got ' + dates.length + '\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_return_34_dates_from_buildLessonDates"
else
  assert_fail "should_return_34_dates_from_buildLessonDates" "buildLessonDates did not return 34 dates"
fi

# Test 8: should_bucket_dates_into_historical_older_recent_and_future_groups
# Arrange
NOW="2024-06-15T10:00:00.000Z"
# Act + Assert
node -e "
const { buildLessonDates } = require('$SCRIPT_DIR/reset-db.js');
const now = new Date('$NOW');
const dates = buildLessonDates(now);
const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const historical = dates.slice(0, 9);
const older = dates.slice(9, 19);
const recent = dates.slice(19, 29);
const future = dates.slice(29, 34);
if (!historical.every(d => d < sevenDaysAgo)) { process.stderr.write('historical bucket has recent dates\n'); process.exit(1); }
if (!older.every(d => d < sevenDaysAgo)) { process.stderr.write('older bucket has dates within past week\n'); process.exit(1); }
if (!recent.every(d => d >= sevenDaysAgo && d < now)) { process.stderr.write('recent bucket out of expected range\n'); process.exit(1); }
if (!future.every(d => d > now)) { process.stderr.write('future bucket has past dates\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_bucket_dates_into_historical_older_recent_and_future_groups"
else
  assert_fail "should_bucket_dates_into_historical_older_recent_and_future_groups" "date buckets out of expected range"
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

# Test 11: should_return_tier1_fee_for_even_index
# Act + Assert
node -e "
const { getLessonVariation } = require('$SCRIPT_DIR/reset-db.js');
const t1 = { name: 'T1', price: 100 };
const t2 = { name: 'T2', price: 150 };
const v = getLessonVariation(0, t1, t2);
if (v.fee !== 100) { process.stderr.write('expected fee 100, got ' + v.fee + '\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_return_tier1_fee_for_even_index"
else
  assert_fail "should_return_tier1_fee_for_even_index" "getLessonVariation(0) did not return tier 1 fee"
fi

# Test 12: should_return_tier2_fee_for_odd_index
# Act + Assert
node -e "
const { getLessonVariation } = require('$SCRIPT_DIR/reset-db.js');
const t1 = { name: 'T1', price: 100 };
const t2 = { name: 'T2', price: 150 };
const v = getLessonVariation(1, t1, t2);
if (v.fee !== 150) { process.stderr.write('expected fee 150, got ' + v.fee + '\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_return_tier2_fee_for_odd_index"
else
  assert_fail "should_return_tier2_fee_for_odd_index" "getLessonVariation(1) did not return tier 2 fee"
fi

# Test 13: should_return_exertion_5_at_index_4
# Act + Assert
node -e "
const { getLessonVariation } = require('$SCRIPT_DIR/reset-db.js');
const t1 = { name: 'T1', price: 100 };
const t2 = { name: 'T2', price: 150 };
const v = getLessonVariation(4, t1, t2);
if (v.exertionLevel !== 5) { process.stderr.write('expected exertionLevel 5 at i=4, got ' + v.exertionLevel + '\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_return_exertion_5_at_index_4"
else
  assert_fail "should_return_exertion_5_at_index_4" "getLessonVariation(4) did not return exertionLevel 5"
fi

# Test 14: should_return_exertion_1_at_index_5
# Act + Assert
node -e "
const { getLessonVariation } = require('$SCRIPT_DIR/reset-db.js');
const t1 = { name: 'T1', price: 100 };
const t2 = { name: 'T2', price: 150 };
const v = getLessonVariation(5, t1, t2);
if (v.exertionLevel !== 1) { process.stderr.write('expected exertionLevel 1 at i=5, got ' + v.exertionLevel + '\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_return_exertion_1_at_index_5"
else
  assert_fail "should_return_exertion_1_at_index_5" "getLessonVariation(5) did not return exertionLevel 1"
fi

# Test 15: should_return_jumping_true_for_even_index
# Act + Assert
node -e "
const { getLessonVariation } = require('$SCRIPT_DIR/reset-db.js');
const t1 = { name: 'T1', price: 100 };
const t2 = { name: 'T2', price: 150 };
const v = getLessonVariation(0, t1, t2);
if (v.jumping !== true) { process.stderr.write('expected jumping true at i=0, got ' + v.jumping + '\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_return_jumping_true_for_even_index"
else
  assert_fail "should_return_jumping_true_for_even_index" "getLessonVariation(0) did not return jumping true"
fi

# Test 16: should_return_jumping_false_for_odd_index
# Act + Assert
node -e "
const { getLessonVariation } = require('$SCRIPT_DIR/reset-db.js');
const t1 = { name: 'T1', price: 100 };
const t2 = { name: 'T2', price: 150 };
const v = getLessonVariation(1, t1, t2);
if (v.jumping !== false) { process.stderr.write('expected jumping false at i=1, got ' + v.jumping + '\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_return_jumping_false_for_odd_index"
else
  assert_fail "should_return_jumping_false_for_odd_index" "getLessonVariation(1) did not return jumping false"
fi

# Test 17: should_export_DEV_PENDING_RIDER
# Act + Assert
node -e "
const { DEV_PENDING_RIDER } = require('$SCRIPT_DIR/reset-db.js');
if (!DEV_PENDING_RIDER) { process.stderr.write('DEV_PENDING_RIDER not exported\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_export_DEV_PENDING_RIDER"
else
  assert_fail "should_export_DEV_PENDING_RIDER" "DEV_PENDING_RIDER not exported"
fi

# Test 18: should_export_DEV_PENDING_RIDER_with_email_as_string
# Act + Assert
node -e "
const { DEV_PENDING_RIDER } = require('$SCRIPT_DIR/reset-db.js');
if (typeof DEV_PENDING_RIDER.email !== 'string') { process.stderr.write('expected email to be a string, got ' + typeof DEV_PENDING_RIDER.email + '\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_export_DEV_PENDING_RIDER_with_email_as_string"
else
  assert_fail "should_export_DEV_PENDING_RIDER_with_email_as_string" "DEV_PENDING_RIDER.email is not a string"
fi

# Test 19: should_export_DEV_PENDING_RIDER_with_firstName
# Act + Assert
node -e "
const { DEV_PENDING_RIDER } = require('$SCRIPT_DIR/reset-db.js');
if (!DEV_PENDING_RIDER.firstName) { process.stderr.write('expected firstName to be present\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_export_DEV_PENDING_RIDER_with_firstName"
else
  assert_fail "should_export_DEV_PENDING_RIDER_with_firstName" "DEV_PENDING_RIDER.firstName is missing"
fi

# Test 20: should_export_DEV_PENDING_RIDER_with_lastName
# Act + Assert
node -e "
const { DEV_PENDING_RIDER } = require('$SCRIPT_DIR/reset-db.js');
if (!DEV_PENDING_RIDER.lastName) { process.stderr.write('expected lastName to be present\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_export_DEV_PENDING_RIDER_with_lastName"
else
  assert_fail "should_export_DEV_PENDING_RIDER_with_lastName" "DEV_PENDING_RIDER.lastName is missing"
fi

# Test 21: should_return_null_for_future_lesson
# Act + Assert
node -e "
const { getPaymentType } = require('$SCRIPT_DIR/reset-db.js');
const result = getPaymentType(0, false);
if (result !== null) { process.stderr.write('expected null for future lesson, got ' + result + '\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_return_null_for_future_lesson"
else
  assert_fail "should_return_null_for_future_lesson" "getPaymentType(0, false) did not return null"
fi

# Test 22: should_return_null_for_unpaid_slot_at_index_4
# Act + Assert
node -e "
const { getPaymentType } = require('$SCRIPT_DIR/reset-db.js');
const result = getPaymentType(4, true);
if (result !== null) { process.stderr.write('expected null at i=4, got ' + result + '\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_return_null_for_unpaid_slot_at_index_4"
else
  assert_fail "should_return_null_for_unpaid_slot_at_index_4" "getPaymentType(4, true) did not return null"
fi

# Test 23: should_return_null_for_every_fifth_past_lesson
# Act + Assert
node -e "
const { getPaymentType } = require('$SCRIPT_DIR/reset-db.js');
const unpaidIndices = [9, 14, 19, 24];
for (const i of unpaidIndices) {
  const result = getPaymentType(i, true);
  if (result !== null) { process.stderr.write('expected null at i=' + i + ', got ' + result + '\n'); process.exit(1); }
}
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_return_null_for_every_fifth_past_lesson"
else
  assert_fail "should_return_null_for_every_fifth_past_lesson" "getPaymentType did not return null for every 5th index"
fi

# Test 24: should_return_a_valid_payment_type_for_paid_past_lesson
# Act + Assert
node -e "
const { getPaymentType, PAYMENT_TYPES } = require('$SCRIPT_DIR/reset-db.js');
const result = getPaymentType(0, true);
if (!PAYMENT_TYPES.includes(result)) { process.stderr.write('expected a valid payment type, got ' + result + '\n'); process.exit(1); }
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_return_a_valid_payment_type_for_paid_past_lesson"
else
  assert_fail "should_return_a_valid_payment_type_for_paid_past_lesson" "getPaymentType(0, true) did not return a valid payment type"
fi

# Test 25: should_cover_all_five_payment_types_across_past_lessons
# Act + Assert
node -e "
const { getPaymentType, PAYMENT_TYPES } = require('$SCRIPT_DIR/reset-db.js');
const seen = new Set();
for (let i = 0; i < 29; i++) {
  const pt = getPaymentType(i, true);
  if (pt !== null) seen.add(pt);
}
for (const pt of PAYMENT_TYPES) {
  if (!seen.has(pt)) { process.stderr.write('payment type not covered: ' + pt + '\n'); process.exit(1); }
}
" 2>/dev/null
exit_code=$?
if [ "$exit_code" -eq 0 ]; then
  assert_pass "should_cover_all_five_payment_types_across_past_lessons"
else
  assert_fail "should_cover_all_five_payment_types_across_past_lessons" "not all 5 payment types covered across past lessons"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
