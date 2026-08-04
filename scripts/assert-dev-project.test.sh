#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/assert-dev-project.sh"

DEV_URL="https://devref00000000000.supabase.co"
DEV_REF="devref00000000000"
OTHER_URL="https://prodref0000000000.supabase.co"
OTHER_REF="prodref0000000000"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# Creates a temp git repo with a .env.local and a linked-project ref. Pass "-" for either
# env value or for the ref to omit that line/file entirely.
make_repo() {
  local next_url="$1" dev_url="$2" linked_ref="$3"
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  if [ "$next_url" != "-" ] || [ "$dev_url" != "-" ]; then
    : > "$dir/.env.local"
    [ "$next_url" != "-" ] && echo "NEXT_PUBLIC_SUPABASE_URL=$next_url" >> "$dir/.env.local"
    [ "$dev_url" != "-" ] && echo "DEV_SUPABASE_URL=$dev_url" >> "$dir/.env.local"
  fi
  if [ "$linked_ref" != "-" ]; then
    mkdir -p "$dir/supabase/.temp"
    echo "$linked_ref" > "$dir/supabase/.temp/project-ref"
  fi
  echo "$dir"
}

# Test 1: env matches DEV_SUPABASE_URL and the linked project is the dev project — exits 0
REPO="$(make_repo "$DEV_URL" "$DEV_URL" "$DEV_REF")"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "dev project linked and .env.local agrees: exits 0"
else
  assert_fail "dev project linked and .env.local agrees: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 2: .env.local is dev-pointed but the CLI is linked elsewhere — the re-link case
REPO="$(make_repo "$DEV_URL" "$DEV_URL" "$OTHER_REF")"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "$OTHER_REF"; then
  assert_pass "linked elsewhere: exits non-zero, names the linked ref"
else
  assert_fail "linked elsewhere: exits non-zero, names the linked ref" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 3: .env.local points at a non-dev project — the stated acceptance-criteria check
REPO="$(make_repo "$OTHER_URL" "$DEV_URL" "$DEV_REF")"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "$OTHER_URL"; then
  assert_pass "NEXT_PUBLIC_SUPABASE_URL mismatch: exits non-zero, prints both values"
else
  assert_fail "NEXT_PUBLIC_SUPABASE_URL mismatch: exits non-zero, prints both values" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 4: DEV_SUPABASE_URL absent — nothing to verify against, so fail closed
REPO="$(make_repo "$DEV_URL" "-" "$DEV_REF")"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "DEV_SUPABASE_URL"; then
  assert_pass "DEV_SUPABASE_URL unset: exits non-zero, names the missing var"
else
  assert_fail "DEV_SUPABASE_URL unset: exits non-zero, names the missing var" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 5: no linked project at all — db push would prompt for one, so stop first
REPO="$(make_repo "$DEV_URL" "$DEV_URL" "-")"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "supabase link"; then
  assert_pass "no linked project: exits non-zero, points at supabase link"
else
  assert_fail "no linked project: exits non-zero, points at supabase link" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 6: no .env.local — neither value is readable, so fail closed
REPO="$(make_repo "-" "-" "$DEV_REF")"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q ".env.local"; then
  assert_pass "no .env.local: exits non-zero, names the missing file"
else
  assert_fail "no .env.local: exits non-zero, names the missing file" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 7: DEV_SUPABASE_URL is not a Supabase project URL — say so rather than compare a garbage ref
REPO="$(make_repo "not-a-url" "not-a-url" "$DEV_REF")"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "could not extract a project ref"; then
  assert_pass "unparseable DEV_SUPABASE_URL: exits non-zero, names the extraction failure"
else
  assert_fail "unparseable DEV_SUPABASE_URL: exits non-zero, names the extraction failure" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 8: --allow-prod opts out of every check above — the deliberate production push
REPO="$(make_repo "$OTHER_URL" "$DEV_URL" "$OTHER_REF")"
if (cd "$REPO" && bash "$SCRIPT" --allow-prod >/dev/null 2>&1); then
  assert_pass "--allow-prod on a non-dev project: exits 0"
else
  assert_fail "--allow-prod on a non-dev project: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 9: --allow-prod still reports the project it is about to write, rather than passing silently
REPO="$(make_repo "$OTHER_URL" "$DEV_URL" "$OTHER_REF")"
out="$(cd "$REPO" && bash "$SCRIPT" --allow-prod 2>&1)"
if echo "$out" | grep -q "$OTHER_REF"; then
  assert_pass "--allow-prod: names the linked project it is not checking"
else
  assert_fail "--allow-prod: names the linked project it is not checking" "output=$out"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
