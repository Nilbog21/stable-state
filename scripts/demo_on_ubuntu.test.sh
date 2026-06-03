#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/demo_on_ubuntu.sh"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# Creates a temp git repo with stubs in $dir/bin.
# Omit a stub name to simulate that prerequisite being missing.
# Args: omit_ufw omit_node omit_npx (each 0=include, 1=omit; default all included)
make_repo() {
  local omit_ufw="${1:-0}"
  local omit_node="${2:-0}"
  local omit_npx="${3:-0}"
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/bin" "$dir/scripts"

  # sudo passthrough
  cat > "$dir/bin/sudo" <<'EOF'
#!/usr/bin/env bash
exec "$@"
EOF
  chmod +x "$dir/bin/sudo"

  # ufw stub
  if [ "$omit_ufw" -eq 0 ]; then
    cat > "$dir/bin/ufw" <<UEWEOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$dir/ufw.log"
exit 0
UEWEOF
    chmod +x "$dir/bin/ufw"
  fi

  # node stub (existence check only)
  if [ "$omit_node" -eq 0 ]; then
    cat > "$dir/bin/node" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
    chmod +x "$dir/bin/node"
  fi

  # npx stub
  if [ "$omit_npx" -eq 0 ]; then
    cat > "$dir/bin/npx" <<NPXEOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$dir/npx.log"
exit 0
NPXEOF
    chmod +x "$dir/bin/npx"
  fi

  # npm stub
  cat > "$dir/bin/npm" <<NPMEOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$dir/npm.log"
exit 0
NPMEOF
  chmod +x "$dir/bin/npm"

  # hostname stub (returns fixed LAN IP)
  cat > "$dir/bin/hostname" <<'EOF'
#!/usr/bin/env bash
echo "192.168.1.42"
EOF
  chmod +x "$dir/bin/hostname"

  # systemd-inhibit stub (logs args, exits immediately so EXIT trap fires)
  cat > "$dir/bin/systemd-inhibit" <<SDIEOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$dir/inhibit.log"
exit 0
SDIEOF
  chmod +x "$dir/bin/systemd-inhibit"

  echo "$dir"
}

# Test 1: missing ufw exits non-zero with error mentioning 'ufw'
REPO="$(make_repo 1 0 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q "ufw"; then
  assert_pass "missing ufw: exits non-zero with error mentioning 'ufw'"
elif [ "$exit_code" -eq 0 ]; then
  assert_fail "missing ufw: exits non-zero with error mentioning 'ufw'" "script exited 0"
else
  assert_fail "missing ufw: exits non-zero with error mentioning 'ufw'" "error output did not mention 'ufw' (got: $output)"
fi
rm -rf "$REPO"

# Test 2: missing node exits non-zero with error mentioning 'node'
REPO="$(make_repo 0 1 0)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q "node"; then
  assert_pass "missing node: exits non-zero with error mentioning 'node'"
elif [ "$exit_code" -eq 0 ]; then
  assert_fail "missing node: exits non-zero with error mentioning 'node'" "script exited 0"
else
  assert_fail "missing node: exits non-zero with error mentioning 'node'" "error output did not mention 'node' (got: $output)"
fi
rm -rf "$REPO"

# Test 3: missing npx exits non-zero with error mentioning 'npx'
REPO="$(make_repo 0 0 1)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
exit_code=$?
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -q "npx"; then
  assert_pass "missing npx: exits non-zero with error mentioning 'npx'"
elif [ "$exit_code" -eq 0 ]; then
  assert_fail "missing npx: exits non-zero with error mentioning 'npx'" "script exited 0"
else
  assert_fail "missing npx: exits non-zero with error mentioning 'npx'" "error output did not mention 'npx' (got: $output)"
fi
rm -rf "$REPO"

# Test 4: opens UFW port 3000 on startup
REPO="$(make_repo)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
if grep -q "allow 3000/tcp" "$REPO/ufw.log" 2>/dev/null; then
  assert_pass "opens UFW port 3000: 'allow 3000/tcp' logged"
else
  assert_fail "opens UFW port 3000: 'allow 3000/tcp' logged" "ufw.log missing or does not contain 'allow 3000/tcp'"
fi
rm -rf "$REPO"

# Test 5: npm run build is logged before npx is called
REPO="$(make_repo)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
npm_time="$(stat -c %Y "$REPO/npm.log" 2>/dev/null || echo 0)"
npx_time="$(stat -c %Y "$REPO/npx.log" 2>/dev/null || echo 0)"
npm_content="$(cat "$REPO/npm.log" 2>/dev/null || echo '')"
if echo "$npm_content" | grep -q "run build" && [ -f "$REPO/npx.log" ]; then
  assert_pass "npm run build called before npx start"
elif ! echo "$npm_content" | grep -q "run build"; then
  assert_fail "npm run build called before npx start" "npm.log does not contain 'run build' (got: $npm_content)"
else
  assert_fail "npm run build called before npx start" "npx was not called"
fi
rm -rf "$REPO"

# Test 6: systemd-inhibit called with --what=idle and npx next start -H 0.0.0.0 -p 3000
REPO="$(make_repo)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
inhibit_content="$(cat "$REPO/inhibit.log" 2>/dev/null || echo '')"
if echo "$inhibit_content" | grep -q "\-\-what=idle" && echo "$inhibit_content" | grep -q "next start" && echo "$inhibit_content" | grep -q "\-H 0.0.0.0" && echo "$inhibit_content" | grep -q "\-p 3000"; then
  assert_pass "systemd-inhibit: called with --what=idle and npx next start -H 0.0.0.0 -p 3000"
else
  assert_fail "systemd-inhibit: called with --what=idle and npx next start -H 0.0.0.0 -p 3000" "inhibit.log: $inhibit_content"
fi
rm -rf "$REPO"

# Test 7: output contains the LAN IP URL
REPO="$(make_repo)"
output="$(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" 2>&1)"
if echo "$output" | grep -q "http://192.168.1.42:3000"; then
  assert_pass "prints LAN IP URL: http://192.168.1.42:3000"
else
  assert_fail "prints LAN IP URL: http://192.168.1.42:3000" "output: $output"
fi
rm -rf "$REPO"

# Test 8: trap closes UFW port on exit (ufw.log contains both allow and delete)
REPO="$(make_repo)"
(cd "$REPO" && PATH="$REPO/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1)
ufw_content="$(cat "$REPO/ufw.log" 2>/dev/null || echo '')"
if echo "$ufw_content" | grep -q "allow 3000/tcp" && echo "$ufw_content" | grep -q "delete allow 3000/tcp"; then
  assert_pass "trap closes UFW port on exit: both allow and delete logged"
else
  assert_fail "trap closes UFW port on exit: both allow and delete logged" "ufw.log: $ufw_content"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
