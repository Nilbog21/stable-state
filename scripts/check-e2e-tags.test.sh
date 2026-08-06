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
# playwright.config.ts declares, in the same `grep: /@name/` + `storageState:` shape the script
# parses. `mobile` points at manager.json exactly as the real config does: it is a viewport
# project, not an identity, which is the whole reason the role mapping goes through storageState
# rather than through the project's name.
DEFAULT_PROJECTS="  projects: [
    { name: 'manager', grep: /@manager/, use: { storageState: 'e2e/.auth/manager.json' } },
    { name: 'trainer', grep: /@trainer/, use: { storageState: 'e2e/.auth/trainer.json' } },
    { name: 'rider',   grep: /@rider/,   use: { storageState: 'e2e/.auth/rider.json'   } },
    { name: 'mobile',  grep: /@mobile/,  use: { storageState: 'e2e/.auth/manager.json' } },
  ],"

# Creates a temp git repo holding one checklist phase file, one spec file, and a
# playwright.config.ts — the three inputs the script reads. The phase file's asserting-role
# declaration is prepended rather than left to each caller: `role-agnostic` is unconstrained, so
# the fixtures that predate the role check keep their verdicts, and the ones that exercise it
# pass their own declaration in.
make_repo() {
  # `${4-…}` and not `${4:-…}`: an explicitly empty 4th argument is the fixture for a phase file
  # carrying no declaration at all, which `:-` would silently hand the default back.
  local checklist="$1" spec="$2" projects="${3:-$DEFAULT_PROJECTS}" \
    role_comment="${4-<!-- Asserting role: role-agnostic -->}"
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/checklists/pre-release" "$dir/e2e"
  printf '%s\n%s\n' "$role_comment" "$checklist" > "$dir/checklists/pre-release/phase-1-setup.md"
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
  printf '%s' "$err_output" | grep -c "checklists/pre-release/phase-1-setup.md:3" >/dev/null; then
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
  "$REPO" "checklists/pre-release/phase-1-setup.md:3"
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

# Test 13: the tag resolves and runs, but under a project whose identity is not the one the phase
# declares it asserts as. `PRE_RELEASE_TEST_CHECKLIST.md`'s header has called this tag a lie since
# #1292 — a rider-phase line can only ever be covered by a rider-eye test — and the gate accepted
# it until #1392. Third silent-green path: the named test genuinely passes, against a page nobody
# walking this phase ever sees.
REPO="$(make_repo '- [ ] Something happens (e2e: a_thing_happens)' \
  "test('a_thing_happens @manager', async ({ page }) => {});" \
  "$DEFAULT_PROJECTS" '<!-- Asserting role: rider -->')"
assert_fails_with "tag whose test asserts as a role this phase does not: exits non-zero" \
  "$REPO" "runs as manager, but this phase asserts as rider"
rm -rf "$REPO"

# Test 14: a `@mobile` tag under a manager phase. `mobile` is a viewport project running
# manager.json, and phase-4 carries exactly one such tag — so a phase-name-to-project-name rule
# would false-positive on the real tree immediately. This is what proves the mapping goes through
# storageState rather than through the project's name.
REPO="$(make_repo '- [ ] Something happens (e2e: a_thing_happens)' \
  "test('a_thing_happens @mobile', async ({ page }) => {});" \
  "$DEFAULT_PROJECTS" '<!-- Asserting role: manager -->')"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "@mobile tag under a manager phase: exits 0"
else
  assert_fail "@mobile tag under a manager phase: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Tests 15 and 16: one test carrying two project tags, claimed from each of the two phases whose
# role it runs as. 6 tags are this shape today (3 in phase 5, 3 in phase 6), so a rule demanding a
# single role would fail the tree it was written against. One matching role is enough.
for role in trainer rider; do
  REPO="$(make_repo '- [ ] Something happens (e2e: a_thing_happens)' \
    "test('a_thing_happens @rider @trainer', async ({ page }) => {});" \
    "$DEFAULT_PROJECTS" "<!-- Asserting role: $role -->")"
  if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
    assert_pass "dual-project tag under a $role phase: exits 0"
  else
    assert_fail "dual-project tag under a $role phase: exits 0" "script exited non-zero"
  fi
  rm -rf "$REPO"
done

# Test 17: `role-agnostic` is the escape hatch — a phase with no single walker (phase 1 is the only
# one) constrains nothing, and any project-tagged test satisfies it. Deliberately NOT admitted for
# phase 4, whose comment also says "role-agnostic": there it describes the assertion's nature
# rather than the identity walking the phase, and reading it as a token would exempt 560 tags.
REPO="$(make_repo '- [ ] Something happens (e2e: a_thing_happens)' \
  "test('a_thing_happens @manager', async ({ page }) => {});" \
  "$DEFAULT_PROJECTS" '<!-- Asserting role: role-agnostic -->')"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "role-agnostic phase admits any project-tagged test: exits 0"
else
  assert_fail "role-agnostic phase admits any project-tagged test: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 18: a phase file carrying tags but no declaration at all. Falling back to unconstrained is
# this gate's own failure class — a phase file added by a future split would be silently exempt
# from the role check while reporting the same OK, which is the `CHECKLIST_GLOBS` argument again
# one level down.
REPO="$(make_repo '- [ ] Something happens (e2e: a_thing_happens)' \
  "test('a_thing_happens @manager', async ({ page }) => {});" \
  "$DEFAULT_PROJECTS" '')"
assert_fails_with "tagged phase file with no asserting-role declaration: exits non-zero" \
  "$REPO" "no \`Asserting role:\` comment"
rm -rf "$REPO"

# Test 19: a head that isn't a role. Only the text before the first ` — ` is parsed, so the prose
# tail is free to say anything — but the head has to resolve, and `role-agnostic setup` (phase 1's
# wording before #1392) is not a token. Unknown means FAIL, never unconstrained.
REPO="$(make_repo '- [ ] Something happens (e2e: a_thing_happens)' \
  "test('a_thing_happens @manager', async ({ page }) => {});" \
  "$DEFAULT_PROJECTS" '<!-- Asserting role: role-agnostic setup — an unauthenticated visitor. -->')"
assert_fails_with "unknown role token: exits non-zero" \
  "$REPO" "unknown asserting-role token"
rm -rf "$REPO"

# Test 20: an empty head, in a file carrying NO tags. The declaration is only *required* where
# there are tags, but one that exists is parsed wherever it sits: otherwise a typo in an untagged
# phase file lies dormant and surfaces years later, in the unrelated PR that adds that phase's
# first tag.
REPO="$(make_repo '- [ ] Something happens, asserted by nothing' \
  "test('a_thing_happens @manager', async ({ page }) => {});" \
  "$DEFAULT_PROJECTS" '<!-- Asserting role: -->')"
assert_fails_with "empty asserting-role head in an untagged phase file: exits non-zero" \
  "$REPO" "unparseable"
rm -rf "$REPO"

# Test 21: two declarations in one file. Neither last-wins nor union is defensible — the file is
# ambiguous about what walks it, and picking either silently answers a question only a human can.
REPO="$(make_repo '<!-- Asserting role: rider -->
- [ ] Something happens (e2e: a_thing_happens)' \
  "test('a_thing_happens @manager', async ({ page }) => {});" \
  "$DEFAULT_PROJECTS" '<!-- Asserting role: manager -->')"
assert_fails_with "two asserting-role declarations in one file: exits non-zero" \
  "$REPO" "2 \`Asserting role:\` comments"
rm -rf "$REPO"

# Test 22: a configured project whose storageState the script can't read. Same fail-closed rule as
# test 8's empty projects list, one level in: a project silently mapped to no role would make every
# tag naming it fail the role check for a reason the config, not the checklist, is responsible for.
REPO="$(make_repo '- [ ] Something happens (e2e: a_thing_happens)' \
  "test('a_thing_happens @manager', async ({ page }) => {});" \
  "  projects: [
    { name: 'manager', grep: /@manager/ },
  ],")"
assert_fails_with "project with no parseable storageState: exits non-zero" \
  "$REPO" "no parseable storageState"
rm -rf "$REPO"

# Test 23: the real tree. This is the gate's own acceptance criterion — it was written against a
# tree measured clean (733 tags, 0 orphans, and 0 role violations: phase 4 is 559 @manager plus 1
# @mobile, phase 5 is 82 @trainer plus 3 dual, phase 6 is 85 @rider plus 3 dual), so a non-zero
# here on the first commit means the scanner is wrong, not the repo.
if (cd "$SCRIPT_DIR/.." && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "this repository: exits 0"
else
  assert_fail "this repository: exits 0" "script exited non-zero"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
