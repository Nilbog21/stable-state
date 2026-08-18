#!/usr/bin/env bash

# Tests for scripts/workflow-ci-wait.sh's stale-head veto (#1622). Follows e2e-slot.test.sh's
# pattern: plain assert_pass/assert_fail counters, one throwaway fixture per case, no `set -e`.
#
# **The seam is a PATH shim plus a real git repo, and the script under test is unmodified.** The
# gate reaches outside itself exactly twice, and each half gets its own interception point:
#
#   - `gh` — `gh pr view --json …` and `gh api …/actions/runs?head_sha=…`. A shim directory
#     prepended to PATH replaces exactly `gh`, dispatching on its argv and answering from
#     per-SHA fixture files, so no network call is ever made.
#   - `git` — the anchor (`git rev-parse @{u}` plus the `branch.<local>.merge` config read).
#     Deliberately **not** stubbed. Each case runs in an mktemp'd repo with a real branch, a real
#     `origin` remote and a real remote-tracking ref (written as a loose ref file — see
#     `upstream_sha` below for why not `git update-ref`), so the anchor reads a genuine upstream the
#     way it will in a worktree. A stubbed `git` would let the anchor agree with a fixture that
#     agrees with it, which is the shape of self-verification this gate exists to stop.
#
# Every case passes timeout-minutes `0`, which makes the deadline expire on the first poll: a
# pending read therefore surfaces immediately as exit 3 naming its reason, instead of sleeping
# 15s per poll. Pending is not a terminal code in this script's scheme, so exit 3 with the reason
# *is* how "pending" is observable from outside — the thing the stale window must resolve to.
#
# The two SHAs in the stale cases are the ones from #1622's real observation on PR #1615: the gate
# reported `da8f120f`'s pass for pushed head `db71db81`, whose CI in fact failed.

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/workflow-ci-wait.sh"

OLD_SHA="da8f120f9b6b96b23601c787601321aaaaaaaaaa"
NEW_SHA="db71db81ad3392ab3d1d5615e40b7bfcea329ac0"
BRANCH="1607-dev-script-correctness-test-harness"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# --- Fixture -------------------------------------------------------------------------------------

# A temp git repo carrying the script under test, a `gh` shim on PATH, and one commit on $BRANCH.
# `upstream_sha` plants refs/remotes/origin/$BRANCH at an arbitrary SHA — the repo's own commit is
# irrelevant, since the anchor reads @{u} and never HEAD.
make_repo() {
  local dir
  dir="$(mktemp -d)"
  mkdir -p "$dir/scripts" "$dir/shim" "$dir/fixtures"

  cp "$SCRIPT" "$dir/scripts/workflow-ci-wait.sh"

  git -C "$dir" init -q -b "$BRANCH" >/dev/null 2>&1
  git -C "$dir" -c user.email=t@t -c user.name=t commit -q --allow-empty -m seed >/dev/null 2>&1
  git -C "$dir" remote add origin https://example.invalid/x.git

  # The `gh` shim. Dispatches on argv: `pr view` prints fixtures/pr.json, `api …head_sha=X` prints
  # fixtures/runs-X.json (an empty workflow_runs list when no such file exists — the real API's
  # answer for a SHA it has no run for, which is the just-pushed window).
  cat > "$dir/shim/gh" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  pr)
    cat "$PWD/fixtures/pr.json"
    # A push landing *while the gate is polling*: the upstream ref moves during this very API call.
    # One-shot, so the next poll sees a settled repo rather than a ref that keeps running away.
    if [ -f "$PWD/fixtures/push-mid-poll" ]; then
      cat "$PWD/fixtures/push-mid-poll" > "$GATE_TEST_REF"
      rm -f "$PWD/fixtures/push-mid-poll"
    fi
    ;;
  api)
    sha="${2##*head_sha=}"
    if [ -f "$PWD/fixtures/runs-$sha.json" ]; then
      cat "$PWD/fixtures/runs-$sha.json"
    else
      echo '{"workflow_runs":[]}'
    fi
    ;;
  *) exit 1 ;;
esac
EOF
  chmod +x "$dir/shim/gh"

  echo "$dir"
}

# The ref file is written directly rather than through `git update-ref`, which refuses a SHA no
# object exists for — and the two SHAs here are #1615's real ones, which is the whole point of
# using them. `git rev-parse @{u}` resolves a ref without validating the object behind it, so the
# anchor reads these exactly as it reads a freshly pushed one.
upstream_sha() {
  mkdir -p "$1/.git/refs/remotes/origin"
  printf '%s\n' "$2" > "$1/.git/refs/remotes/origin/$BRANCH"
  git -C "$1" config "branch.$BRANCH.remote" origin
  git -C "$1" config "branch.$BRANCH.merge" "refs/heads/$BRANCH"
}

# $2 = headRefOid the PR record reports, $3 = rollup conclusion (SUCCESS/FAILURE/null for pending)
pr_fixture() {
  local dir="$1" sha="$2" conclusion="$3"
  cat > "$dir/fixtures/pr.json" <<EOF
{"mergeable":"MERGEABLE","headRefOid":"$sha","headRefName":"$BRANCH",
 "statusCheckRollup":[{"name":"ci","status":"COMPLETED","conclusion":"$conclusion"}]}
EOF
}

# $2 = the SHA the run is registered under, $3 = status, $4 = conclusion
runs_fixture() {
  local dir="$1" sha="$2" status="$3" conclusion="$4"
  cat > "$dir/fixtures/runs-$sha.json" <<EOF
{"workflow_runs":[{"name":"CI","status":"$status","conclusion":$conclusion,"head_sha":"$sha"}]}
EOF
}

# Runs the gate inside the fixture repo with the shim on PATH and a 0-minute timeout.
run_gate() {
  local dir="$1"
  ( cd "$dir" && PATH="$dir/shim:$PATH" GATE_TEST_REF="$dir/.git/refs/remotes/origin/$BRANCH" \
      bash scripts/workflow-ci-wait.sh 1 0 2>/dev/null )
}

# --- Test 1: a stale PASS is never emitted for a head GitHub hasn't caught up to -------------------
#
# The dangerous direction, and #1622's second observation verbatim: /finishIssue merges on a
# `CI: pass`, so an inherited pass merges a head CI never evaluated. Here the PR record still
# reports the previous head, that head's run is completed+success, and the pushed head has no run
# registered yet — the two halves of the gate agree with each other and are both wrong.
DIR="$(make_repo)"
upstream_sha "$DIR" "$NEW_SHA"
pr_fixture "$DIR" "$OLD_SHA" "SUCCESS"
runs_fixture "$DIR" "$OLD_SHA" "completed" '"success"'
out="$(run_gate "$DIR")" && rc=0 || rc=$?
if [ "$rc" -ne 0 ] && [ "${out#CI: pass}" = "$out" ]; then
  assert_pass "stale head: a completed pass for the previous head is not emitted as CI: pass"
else
  assert_fail "stale head: a completed pass for the previous head is not emitted as CI: pass" \
    "exit $rc, output: $out"
fi
if [ "$rc" -eq 3 ] && [ "${out#CI: timeout}" != "$out" ] && [ "${out#*db71db81}" != "$out" ]; then
  assert_pass "stale head: resolves as pending, naming the head GitHub has not reported"
else
  assert_fail "stale head: resolves as pending, naming the head GitHub has not reported" \
    "exit $rc, output: $out"
fi
rm -rf "$DIR"

# --- Test 2: a stale FAIL is never emitted either --------------------------------------------------
#
# The other direction, and #1622's first observation. It needs its own case rather than riding on
# test 1: the fail verdict exits *before* pending is assembled, so a veto that only adds a pending
# marker would still exit 1 here.
DIR="$(make_repo)"
upstream_sha "$DIR" "$NEW_SHA"
pr_fixture "$DIR" "$OLD_SHA" "FAILURE"
runs_fixture "$DIR" "$OLD_SHA" "completed" '"failure"'
out="$(run_gate "$DIR")" && rc=0 || rc=$?
if [ "$rc" -ne 1 ] && [ "${out#CI: fail}" = "$out" ]; then
  assert_pass "stale head: a completed failure for the previous head is not emitted as CI: fail"
else
  assert_fail "stale head: a completed failure for the previous head is not emitted as CI: fail" \
    "exit $rc, output: $out"
fi
if [ "$rc" -eq 3 ]; then
  assert_pass "stale head: a stale failure resolves as pending"
else
  assert_fail "stale head: a stale failure resolves as pending" "exit $rc, output: $out"
fi
rm -rf "$DIR"

# --- Test 3: fresh head, no run registered yet, is pending -----------------------------------------
#
# The window #1622's hypothesis proposed and the code already handled. Guards it against the fix:
# the anchor must not turn "GitHub agrees on the head, CI hasn't started" into a verdict.
DIR="$(make_repo)"
upstream_sha "$DIR" "$NEW_SHA"
pr_fixture "$DIR" "$NEW_SHA" "SUCCESS"
out="$(run_gate "$DIR")" && rc=0 || rc=$?
if [ "$rc" -eq 3 ] && [ "${out#*workflow run not started}" != "$out" ]; then
  assert_pass "fresh head with zero runs: pending, not pass"
else
  assert_fail "fresh head with zero runs: pending, not pass" "exit $rc, output: $out"
fi
rm -rf "$DIR"

# --- Test 4: fresh head, everything green, still passes --------------------------------------------
#
# The happy path the anchor must not break — a veto that pends when the two SHAs *agree* would
# make the gate useless in exactly the case it is normally invoked in.
DIR="$(make_repo)"
upstream_sha "$DIR" "$NEW_SHA"
pr_fixture "$DIR" "$NEW_SHA" "SUCCESS"
runs_fixture "$DIR" "$NEW_SHA" "completed" '"success"'
out="$(run_gate "$DIR")" && rc=0 || rc=$?
if [ "$rc" -eq 0 ] && [ "$out" = "CI: pass" ]; then
  assert_pass "fresh head, all green: CI: pass"
else
  assert_fail "fresh head, all green: CI: pass" "exit $rc, output: $out"
fi
rm -rf "$DIR"

# --- Test 5: fresh head, failing run, still fails --------------------------------------------------
DIR="$(make_repo)"
upstream_sha "$DIR" "$NEW_SHA"
pr_fixture "$DIR" "$NEW_SHA" "FAILURE"
runs_fixture "$DIR" "$NEW_SHA" "completed" '"failure"'
out="$(run_gate "$DIR")" && rc=0 || rc=$?
if [ "$rc" -eq 1 ] && [ "${out#CI: fail}" != "$out" ]; then
  assert_pass "fresh head, failing run: CI: fail"
else
  assert_fail "fresh head, failing run: CI: fail" "exit $rc, output: $out"
fi
rm -rf "$DIR"

# --- Test 6: no upstream to anchor against — documented fallback, not a hang ------------------------
#
# The gate's callers all `cd` into the PR's worktree first, so the anchor is normally available.
# When it isn't (detached HEAD, no upstream, a caller polling another worktree's PR), the veto has
# nothing to compare against and the gate behaves exactly as it did before #1622 — a documented
# limitation in docs/scripts.md, pinned here so it stays a decision rather than becoming a hang.
DIR="$(make_repo)"
pr_fixture "$DIR" "$NEW_SHA" "SUCCESS"
runs_fixture "$DIR" "$NEW_SHA" "completed" '"success"'
out="$(run_gate "$DIR")" && rc=0 || rc=$?
if [ "$rc" -eq 0 ] && [ "$out" = "CI: pass" ]; then
  assert_pass "no upstream: falls back to the pre-#1622 behaviour rather than pending forever"
else
  assert_fail "no upstream: falls back to the pre-#1622 behaviour rather than pending forever" \
    "exit $rc, output: $out"
fi
rm -rf "$DIR"

# --- Test 7: a mismatch is vetoed in both directions ------------------------------------------------
#
# GitHub reporting a head *newer* than the one we pushed is equally not a verdict this caller may
# act on — someone else pushed, and the runs being scored are for a commit this worktree has never
# seen. Same veto, opposite skew.
DIR="$(make_repo)"
upstream_sha "$DIR" "$OLD_SHA"
pr_fixture "$DIR" "$NEW_SHA" "SUCCESS"
runs_fixture "$DIR" "$NEW_SHA" "completed" '"success"'
out="$(run_gate "$DIR")" && rc=0 || rc=$?
if [ "$rc" -eq 3 ]; then
  assert_pass "head newer than ours: vetoed too, not passed"
else
  assert_fail "head newer than ours: vetoed too, not passed" "exit $rc, output: $out"
fi
rm -rf "$DIR"

# --- Test 8: the anchor is re-read per poll, not cached once at startup ----------------------------
#
# A second push landing while the gate is already polling. Reading the anchor once before the loop
# — the first cut of #1622 — cached the *first* head forever, so once GitHub caught up to the second
# one the cached anchor could never match it again and a real verdict, failure included, degraded
# into a timeout. Reading it per poll and *after* the PR payload is what makes that recoverable, and
# is also what lets this case run in a single poll: the shim moves the ref during `gh pr view`, so a
# startup-only read still sees the old value and emits the (agreeing, but now wrong) `CI: pass`.
DIR="$(make_repo)"
upstream_sha "$DIR" "$OLD_SHA"
pr_fixture "$DIR" "$OLD_SHA" "SUCCESS"
runs_fixture "$DIR" "$OLD_SHA" "completed" '"success"'
printf '%s\n' "$NEW_SHA" > "$DIR/fixtures/push-mid-poll"
out="$(run_gate "$DIR")" && rc=0 || rc=$?
if [ "$rc" -eq 3 ] && [ "${out#*db71db81}" != "$out" ]; then
  assert_pass "a push landing mid-poll is picked up on the same run, not cached away"
else
  assert_fail "a push landing mid-poll is picked up on the same run, not cached away" \
    "exit $rc, output: $out"
fi
rm -rf "$DIR"

# --- Test 9: the anchor holds when the upstream remote isn't called `origin` -----------------------
#
# The branch match reads `branch.<local>.merge`, not the `origin/…` shape of `--abbrev-ref @{u}`, so
# a fork remote under another name doesn't silently disable the veto — the one failure mode this
# must not have, since it fails *open* and looks exactly like a healthy run.
DIR="$(make_repo)"
git -C "$DIR" remote rename origin upstream
mkdir -p "$DIR/.git/refs/remotes/upstream"
printf '%s\n' "$NEW_SHA" > "$DIR/.git/refs/remotes/upstream/$BRANCH"
git -C "$DIR" config "branch.$BRANCH.remote" upstream
git -C "$DIR" config "branch.$BRANCH.merge" "refs/heads/$BRANCH"
pr_fixture "$DIR" "$OLD_SHA" "SUCCESS"
runs_fixture "$DIR" "$OLD_SHA" "completed" '"success"'
out="$(run_gate "$DIR")" && rc=0 || rc=$?
if [ "$rc" -eq 3 ]; then
  assert_pass "non-origin remote: the veto still engages"
else
  assert_fail "non-origin remote: the veto still engages" "exit $rc, output: $out"
fi
rm -rf "$DIR"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
