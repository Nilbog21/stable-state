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

# Test 1: .env.local missing — exits non-zero
REPO="$(make_repo "" 0)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?
if [ "$exit_code" -ne 0 ]; then
  assert_pass "missing .env.local: exits non-zero"
else
  assert_fail "missing .env.local: exits non-zero" "script exited 0"
fi
rm -rf "$REPO"

# Test 2: DEV_MANAGER_EMAIL missing from .env.local — exits non-zero
REPO="$(make_repo "NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?
if [ "$exit_code" -ne 0 ]; then
  assert_pass "missing DEV_MANAGER_EMAIL: exits non-zero"
else
  assert_fail "missing DEV_MANAGER_EMAIL: exits non-zero" "script exited 0"
fi
rm -rf "$REPO"

# Test 3: NEXT_PUBLIC_SUPABASE_URL missing from .env.local — exits non-zero
REPO="$(make_repo "DEV_MANAGER_EMAIL=manager@dev.local
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?
if [ "$exit_code" -ne 0 ]; then
  assert_pass "missing NEXT_PUBLIC_SUPABASE_URL: exits non-zero"
else
  assert_fail "missing NEXT_PUBLIC_SUPABASE_URL: exits non-zero" "script exited 0"
fi
rm -rf "$REPO"

# Test 4: SUPABASE_SERVICE_ROLE_KEY missing from .env.local — exits non-zero
REPO="$(make_repo "DEV_MANAGER_EMAIL=manager@dev.local
NEXT_PUBLIC_SUPABASE_URL=http://localhost" 0)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?
if [ "$exit_code" -ne 0 ]; then
  assert_pass "missing SUPABASE_SERVICE_ROLE_KEY: exits non-zero"
else
  assert_fail "missing SUPABASE_SERVICE_ROLE_KEY: exits non-zero" "script exited 0"
fi
rm -rf "$REPO"

# Test 5: all vars present — node is called, script exits 0
REPO="$(make_repo "DEV_MANAGER_EMAIL=manager@dev.local
NEXT_PUBLIC_SUPABASE_URL=http://localhost
SUPABASE_SERVICE_ROLE_KEY=secret" 0)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
exit_code=$?
if [ "$exit_code" -eq 0 ] && [ -f "$REPO/node.log" ]; then
  assert_pass "all vars present: node called, exits 0"
elif [ "$exit_code" -ne 0 ]; then
  assert_fail "all vars present: node called, exits 0" "script exited non-zero ($exit_code)"
else
  assert_fail "all vars present: node called, exits 0" "node was not called"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
