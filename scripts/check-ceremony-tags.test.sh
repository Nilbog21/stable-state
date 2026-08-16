#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/check-ceremony-tags.sh"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# Creates a temp git repo holding a RELEASE_CEREMONY.md with the given body. The script cds to
# the git toplevel, so the fixture has to be a real repo rather than a bare directory.
make_repo() {
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  cat > "$dir/RELEASE_CEREMONY.md"
  echo "$dir"
}

# Test 1: every ceremony checkbox tagged — exits 0
REPO="$(make_repo <<'EOF'
# Release Ceremony

### 1. A step

- [ ] (auto) Something verifiable
- [ ] (prompt) Something that wants confirming
- [ ] (manual) Something you do
EOF
)"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "all three tags accepted: exits 0"
else
  assert_fail "all three tags accepted: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 2: an untagged checkbox — exits non-zero and names the line number
REPO="$(make_repo <<'EOF'
# Release Ceremony

### 1. A step

- [ ] (auto) Something verifiable
- [ ] Something untagged
EOF
)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "RELEASE_CEREMONY.md:6"; then
  assert_pass "untagged checkbox: exits non-zero, names file:line"
else
  assert_fail "untagged checkbox: exits non-zero, names file:line" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 3: a tag that isn't one of the three — fails. Without this, any parenthesised opener
# satisfies the gate and (e2e-candidate) or (todo) launders an undecided checkbox through.
REPO="$(make_repo <<'EOF'
# Release Ceremony

### 1. A step

- [ ] (e2e-candidate) Wrong vocabulary
EOF
)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "RELEASE_CEREMONY.md:5"; then
  assert_pass "unknown tag: exits non-zero, names file:line"
else
  assert_fail "unknown tag: exits non-zero, names file:line" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 4: two tags on one checkbox — fails. "Exactly one" is the acceptance criterion, and a line
# reading `(auto) (manual)` is an unresolved decision, not a tagged line.
REPO="$(make_repo <<'EOF'
# Release Ceremony

### 1. A step

- [ ] (auto) (manual) Which is it
EOF
)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "RELEASE_CEREMONY.md:5"; then
  assert_pass "two tags on one checkbox: exits non-zero, names file:line"
else
  assert_fail "two tags on one checkbox: exits non-zero, names file:line" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 5: a second tag later in the line's prose does NOT count as a double tag. The tag is the
# line's opener; a step legitimately explains what another tag means in its own text, and a
# line-wide count would fail the real file the moment one did.
REPO="$(make_repo <<'EOF'
# Release Ceremony

### 1. A step

- [ ] (prompt) Confirm before running, unlike the (auto) checkbox above
EOF
)"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "a tag word later in the prose is not a second tag: exits 0"
else
  assert_fail "a tag word later in the prose is not a second tag: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 6: checkboxes inside an "Acceptance criteria to paste into that issue:" block are exempt.
# They are text destined for a GitHub issue body, not ceremony checkboxes — tagging them would be
# meaningless, and demanding it is the failure mode this exemption exists to avoid.
REPO="$(make_repo <<'EOF'
# Release Ceremony

### 1. A step

- [ ] (prompt) An issue is filed
- [ ] (auto) Its PR is merged

Acceptance criteria to paste into that issue:

- [ ] Enumerate every closed issue
- [ ] Cross-check each against the checklist
EOF
)"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "acceptance-criteria checkboxes exempt: exits 0"
else
  assert_fail "acceptance-criteria checkboxes exempt: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 7: the exemption ends at the next ### heading. Mirror of test 6 — without it, "skip
# everything after the first AC block" passes test 6 while silently exempting the rest of the
# file, which is this gate's own failure class.
REPO="$(make_repo <<'EOF'
# Release Ceremony

### 1. A step

Acceptance criteria to paste into that issue:

- [ ] Enumerate every closed issue

### 2. Another step

- [ ] Untagged, and after the block
EOF
)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "RELEASE_CEREMONY.md:11"; then
  assert_pass "exemption ends at the next ### heading: exits non-zero, names file:line"
else
  assert_fail "exemption ends at the next ### heading: exits non-zero, names file:line" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 8: the exemption also ends at a --- part divider. Part 1's last step ends in one before
# Part 2's ## heading, so a rule keyed only on ### would carry an AC block across the divider.
REPO="$(make_repo <<'EOF'
# Release Ceremony

### 1. A step

Acceptance criteria to paste into that issue:

- [ ] Enumerate every closed issue

---

## Part 2

- [ ] Untagged, and after the divider
EOF
)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "RELEASE_CEREMONY.md:13"; then
  assert_pass "exemption ends at a --- divider: exits non-zero, names file:line"
else
  assert_fail "exemption ends at a --- divider: exits non-zero, names file:line" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 9: a ticked checkbox is checked too. The template ships unticked, but a `- [x]` slipping in
# must not be a way past the gate.
REPO="$(make_repo <<'EOF'
# Release Ceremony

### 1. A step

- [x] Untagged and ticked
EOF
)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "RELEASE_CEREMONY.md:5"; then
  assert_pass "ticked checkbox is checked too: exits non-zero, names file:line"
else
  assert_fail "ticked checkbox is checked too: exits non-zero, names file:line" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 10: a file with no checkbox at all fails rather than reporting a clean zero. Same polarity
# as select-specs.sh --lint's "a lint that read nothing" rule — a parse that collected nothing
# clears every check and prints the same OK as a fully tagged file.
REPO="$(make_repo <<'EOF'
# Release Ceremony

Prose only, no checkboxes.
EOF
)"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "no ceremony checkboxes"; then
  assert_pass "zero checkboxes found: fails closed"
else
  assert_fail "zero checkboxes found: fails closed" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 11: a missing RELEASE_CEREMONY.md fails rather than tripping `set -u` or reading empty.
REPO="$(mktemp -d)"
git -C "$REPO" init -q
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && echo "$err_output" | grep -q "RELEASE_CEREMONY.md"; then
  assert_pass "missing RELEASE_CEREMONY.md: fails closed, names the file"
else
  assert_fail "missing RELEASE_CEREMONY.md: fails closed, names the file" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 12: the repo's own RELEASE_CEREMONY.md passes. This is what makes #1542's first acceptance
# criterion a standing regression test rather than a one-time observation.
if (cd "$REPO_ROOT" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "the repo's own RELEASE_CEREMONY.md is fully tagged"
else
  assert_fail "the repo's own RELEASE_CEREMONY.md is fully tagged" "script exited non-zero"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
