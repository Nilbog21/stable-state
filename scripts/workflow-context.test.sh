#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Sourced as a library — the guard in workflow-context.sh stops it before the `gh`/`git`
# round trips, so the label rule can be exercised without a network or a repo.
WORKFLOW_CONTEXT_LIB=1 source "$SCRIPT_DIR/workflow-context.sh"

# assert_base <labels> <expected-base> <expected-base_from_label> <description>
assert_base() {
  local labels="$1" want_base="$2" want_flag="$3" desc="$4"
  base=""
  base_from_label=""
  base_for_labels "$labels"
  if [ "$base" = "$want_base" ] && [ "$base_from_label" = "$want_flag" ]; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc — labels [$labels] gave base=$base base_from_label=$base_from_label," \
      "wanted base=$want_base base_from_label=$want_flag"
    FAIL=$((FAIL + 1))
  fi
}

# The two regressions #1542 fixed. Both are real: #978 -> PR #982 and #979 -> PR #983 each
# landed on release/release-3 while this rule was answering "main", and RELEASE_CEREMONY.md
# steps 5 and 6 prescribe that base citing those very PRs. A ceremony issue must follow its
# release label, not be overridden by process-for-release.
assert_base "documentation release-3 process-for-release" "release/release-3" yes \
  "release-N beats process-for-release (#978/#979 shape)"
assert_base "high-priority process-for-release release-4" "release/release-4" yes \
  "release-N beats process-for-release regardless of label order (#1542's own shape)"

# The label survives as a fallback rather than being deleted: a process-for-release issue
# with no release label still resolves to main *and* still reports base_from_label=yes.
# /finishIssue reads that flag to decide whether to confirm before merging, so demoting the
# label to the untriaged default would make it prompt on a triaged issue. This is also the
# boundary case for the release-N parse: `process-for-release` contains the word "release"
# but no digits, so a base of `main` here is what proves it isn't read as a release label —
# were it read as one, this would route to a nonexistent branch rather than to main.
assert_base "process-for-release" main yes \
  "process-for-release alone still routes to main, decided by label"

# patch-N outranks everything, including a release label (#657's shape: process-for-release
# + patch-2 + rearchitecture + data-migration). Patches branch off and target main.
assert_base "process-for-release patch-2 rearchitecture data-migration" main yes \
  "patch-N beats both process-for-release and release-N (#657 shape)"
assert_base "patch-4 release-4" main yes \
  "patch-N beats release-N"

# The ordinary cases.
assert_base "release-4" "release/release-4" yes \
  "a bare release-N routes to its release branch"
assert_base "bug high-priority" main no \
  "no routing label: main, and base_from_label=no so /finishIssue confirms"
assert_base "" main no \
  "no labels at all: main, and base_from_label=no"

# Boundary: the release-N match is space-anchored on both sides, so a label that merely
# *contains* the token does not match. Without the anchors a `pre-release-4` or `release-40`
# style label silently routes work to the wrong branch — the same class of silent
# mis-routing this test exists for.
assert_base "pre-release-4" main no \
  "a label containing release-N as a substring does not match"
assert_base "release-42" "release/release-42" yes \
  "a multi-digit release number is captured whole, not truncated"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
