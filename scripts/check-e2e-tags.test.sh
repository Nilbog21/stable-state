#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/check-e2e-tags.sh"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# A failing run, asserted on the message it prints rather than only on its exit code. Checking
# the status alone can't tell the failure a test claims to guard from an unrelated crash on the
# same fixture — `runs_under_a_project` inverted, or a `set -u` trip, would keep such a test
# green. Herestring rather than a pipe into `grep -q`, per scripts/CLAUDE.md's pipefail hazard.
assert_fails_with() {
  local label="$1" dir="$2" needle="$3" out exit_code
  out="$(cd "$dir" && bash "$SCRIPT" 2>&1)" && exit_code=0 || exit_code=$?
  if [ "$exit_code" -ne 0 ] && grep -qF "$needle" <<<"$out"; then
    assert_pass "$label"
  else
    assert_fail "$label" "exit=$exit_code output=$out"
  fi
}

# The projects block every fixture repo gets unless it overrides it — the same four the real
# playwright.config.ts declares, in the same `grep: /@name/` shape the script parses.
DEFAULT_PROJECTS="  projects: [
    { name: 'manager', grep: /@manager/ },
    { name: 'trainer', grep: /@trainer/ },
    { name: 'rider',   grep: /@rider/   },
    { name: 'mobile',  grep: /@mobile/  },
  ],"

# Creates a temp git repo holding one checklist phase file, one spec file, and a
# playwright.config.ts — the three inputs the script reads.
make_repo() {
  local checklist="$1" spec="$2" projects="${3:-$DEFAULT_PROJECTS}"
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/checklists/pre-release" "$dir/e2e"
  printf '%s\n' "$checklist" > "$dir/checklists/pre-release/phase-1-setup.md"
  printf '%s\n' "$spec" > "$dir/e2e/fixture.spec.ts"
  printf '%s\n' "export default defineConfig({
$projects
});" > "$dir/playwright.config.ts"
  echo "$dir"
}

# Test 1: a tag resolving to a test that exists and carries a project tag — exits 0
REPO="$(make_repo '- [ ] Something happens (e2e: a_thing_happens)' \
  "test('a_thing_happens @manager', async ({ page }) => {});")"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "tag resolving to a project-tagged test: exits 0"
else
  assert_fail "tag resolving to a project-tagged test: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 2: an orphan tag — exits non-zero, and names both the tag and the checklist file:line it
# sits on, since the fix is made in the checklist rather than in the spec.
REPO="$(make_repo '- [ ] Preamble
- [ ] Something happens (e2e: a_renamed_test)' \
  "test('a_thing_happens @manager', async ({ page }) => {});")"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] &&
  printf '%s' "$err_output" | grep -c "a_renamed_test" >/dev/null &&
  printf '%s' "$err_output" | grep -c "checklists/pre-release/phase-1-setup.md:2" >/dev/null; then
  assert_pass "orphan tag: exits non-zero, names the tag and its checklist file:line"
else
  assert_fail "orphan tag: exits non-zero, names the tag and its checklist file:line" \
    "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 3: the tag resolves, but the test it names carries no project tag. Playwright collects a
# test through a project's `grep`, so this one is collected by nothing and never runs — the
# second silent-green path, and invisible to any amount of green-suite evidence.
REPO="$(make_repo '- [ ] Something happens (e2e: a_thing_happens)' \
  "test('a_thing_happens', async ({ page }) => {});")"
assert_fails_with "tag naming a test with no project tag: exits non-zero" \
  "$REPO" "no project tag, so it never runs"
rm -rf "$REPO"

# Test 4: the mirror of test 3 — the same project-less test, claimed by no checklist line. Both
# checks are about *tags*; the reverse direction is deliberately not linted, because a test with
# no checklist line is legitimate (9 of them today).
REPO="$(make_repo '- [ ] Something else (e2e: another_thing_happens)' \
  "test('a_thing_happens', async ({ page }) => {});
test('another_thing_happens @manager', async ({ page }) => {});")"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "unclaimed test with no project tag: exits 0"
else
  assert_fail "unclaimed test with no project tag: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 5: a template-literal title is skipped rather than reported. It can't be resolved
# statically, and its project tag is `@${role}` — so scanning it would produce a permanent
# false positive on the never-executes check (4 of the 5 real sites are this shape).
REPO="$(make_repo '- [ ] Something happens (e2e: a_thing_happens)' \
  'test(`${role}_no_error_on_${label} @${role}`, async ({ page }) => {});
test('"'"'a_thing_happens @manager'"'"', async ({ page }) => {});')"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "template-literal title alongside a valid tag: exits 0"
else
  assert_fail "template-literal title alongside a valid tag: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 6: one tag claimed by two checklist lines. 18 tags today are shared this way — a check
# split across two checkboxes is covered by one test — so a per-tag uniqueness rule would fail
# the tree it was written against.
REPO="$(make_repo '- [ ] Something happens (e2e: a_thing_happens)
- [ ] And its other half (e2e: a_thing_happens)' \
  "test('a_thing_happens @manager', async ({ page }) => {});")"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "one tag on two checklist lines: exits 0"
else
  assert_fail "one tag on two checklist lines: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 7: the test carries an `@`-suffix that no project greps for. `playwright.config.ts` is the
# source of truth rather than a restated list, so this is the never-executes failure again — and
# it is what proves the projects are being read from the config rather than hardcoded.
REPO="$(make_repo '- [ ] Something happens (e2e: a_thing_happens)' \
  "test('a_thing_happens @nosuchproject', async ({ page }) => {});")"
assert_fails_with "tag naming a test tagged for no configured project: exits non-zero" \
  "$REPO" "no project tag, so it never runs"
rm -rf "$REPO"

# Test 8: a config the script can't read projects out of aborts rather than passing. A run that
# resolved zero projects would clear every tag on the never-executes check and print the same
# "OK" as a genuinely clean tree — select-specs.sh --lint's fail-closed rule, same reasoning.
REPO="$(make_repo '- [ ] Something happens (e2e: a_thing_happens)' \
  "test('a_thing_happens @manager', async ({ page }) => {});" \
  "  projects: [],")"
assert_fails_with "playwright.config.ts declaring no projects: exits non-zero" \
  "$REPO" "no projects parsed out of playwright.config.ts"
rm -rf "$REPO"

# Test 9: a repo with no checklist files at all. Nothing to check is not a failure — the glob
# simply expands to nothing — but the script must not die on the unmatched glob either.
REPO="$(mktemp -d)"
git -C "$REPO" init -q
mkdir -p "$REPO/e2e"
printf '%s\n' "test('a_thing_happens @manager', async ({ page }) => {});" > "$REPO/e2e/fixture.spec.ts"
printf '%s\n' "export default defineConfig({
$DEFAULT_PROJECTS
});" > "$REPO/playwright.config.ts"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "no checklist files: exits 0"
else
  assert_fail "no checklist files: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 10: a tag whose closing paren is missing. The outer substring guard still matches, but the
# extraction regex needs the `)`, so an unguarded scanner drops the line entirely — no count, no
# orphan report, exit 0. That is this gate's own failure class arriving through a typo: the
# malformed tag names a nonexistent test and nothing says so.
REPO="$(make_repo '- [ ] Preamble
- [ ] Missing its paren (e2e: a_renamed_test' \
  "test('a_thing_happens @manager', async ({ page }) => {});")"
assert_fails_with "tag missing its closing paren: exits non-zero, names the file:line" \
  "$REPO" "checklists/pre-release/phase-1-setup.md:2"
rm -rf "$REPO"

# Test 11: the other malformed shape — no space after the colon. Same reasoning as test 10; the
# tag is unparseable, so it must be reported rather than skipped for not looking like a tag.
REPO="$(make_repo '- [ ] Missing its space (e2e:a_renamed_test)' \
  "test('a_thing_happens @manager', async ({ page }) => {});")"
assert_fails_with "tag missing the space after the colon: exits non-zero" \
  "$REPO" "malformed"
rm -rf "$REPO"

# Test 12: two tests whose titles strip to the same key. Keyed by the stripped title, the second
# declaration overwrites the first, so which of the two the never-executes check sees — and
# therefore the verdict — depends on declaration order. Bare-first is the fail-open direction:
# the project-tagged declaration masks a sibling that never runs. The tag can't say which test
# it meant, so the ambiguity itself is the finding.
REPO="$(make_repo '- [ ] Something happens (e2e: a_thing_happens)' \
  "test('a_thing_happens', async ({ page }) => {});
test('a_thing_happens @manager', async ({ page }) => {});")"
assert_fails_with "colliding titles, project-less one declared first: exits non-zero" \
  "$REPO" "no project tag, so it never runs"
rm -rf "$REPO"

# Test 13: the real tree. This is the gate's own acceptance criterion — it was written against a
# tree measured clean (713 tags, 722 static titles, 0 orphans), so a non-zero here on the first
# commit means the scanner is wrong, not the repo.
if (cd "$SCRIPT_DIR/.." && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "this repository: exits 0"
else
  assert_fail "this repository: exits 0" "script exited non-zero"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
