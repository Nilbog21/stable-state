#!/usr/bin/env bash

# Tests for scripts/e2e-slot.sh's counting semaphore (#1295). Every case runs against its own
# mktemp'd E2E_SLOT_DIR, so nothing here can touch a live suite run's slots — including on a
# developer's machine with a full suite in flight, which is exactly when this gate gets run.
#
# "Blocks" is asserted with `timeout`'s 124, not by reading stderr: the property under test is that
# the process does not proceed, and a message is a symptom of that rather than the thing itself.

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/e2e-slot.sh"

# Must match SLOTS in e2e-slot.sh. Not read out of it: a test that derives its expectation from the
# code under test cannot fail when that code changes, and the N+1 case below is the whole point.
SLOTS=2

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# A holder that announces itself: it touches $2 the moment it owns a slot, then sleeps. Every probe
# below waits on that marker rather than on a fixed sleep, so a slow machine delays the test instead
# of turning it into a coin flip. Prints its pid so a case can SIGKILL it.
#
# The pid printed is the *script's* — which is the holder, because e2e-slot.sh `exec`s its command.
start_holder() {
  local dir="$1" marker="$2" exclusive="${3:-}"
  local args=()
  [ -n "$exclusive" ] && args+=(--exclusive)
  E2E_SLOT_DIR="$dir" bash "$SCRIPT" "${args[@]}" \
    bash -c "touch '$marker'; sleep 60" &
  echo $!
}

# Bounded wait for a holder to reach its marker. Non-zero if it never does, so a case reports a
# failed setup rather than a bogus verdict about blocking.
await_marker() {
  local marker="$1" i
  for ((i = 0; i < 100; i++)); do
    [ -e "$marker" ] && return 0
    sleep 0.1
  done
  return 1
}

# SIGKILL rather than SIGTERM, so teardown itself exercises nothing: the point is to leave no holder
# behind between cases, not to test signal handling.
kill_holders() {
  local pid
  for pid in "$@"; do
    kill -9 "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  done
}

# --- Test 1: an acquire on an empty slot dir runs the command and returns its status -------------
DIR="$(mktemp -d)"
if E2E_SLOT_DIR="$DIR" bash "$SCRIPT" true >/dev/null 2>&1; then
  assert_pass "empty slot dir: acquire runs the command, exits 0"
else
  assert_fail "empty slot dir: acquire runs the command, exits 0" "script exited non-zero"
fi
rm -rf "$DIR"

# --- Test 2: the command's own exit status is what the wrapper reports ---------------------------
# Not decoration: `run-checklist-suite.sh` reads Playwright's status through this wrapper to decide
# the suite's verdict, so a swallowed non-zero would report a failing suite as green.
DIR="$(mktemp -d)"
E2E_SLOT_DIR="$DIR" bash "$SCRIPT" bash -c 'exit 37' >/dev/null 2>&1 && rc=0 || rc=$?
if [ "$rc" -eq 37 ]; then
  assert_pass "the wrapped command's exit status passes through"
else
  assert_fail "the wrapped command's exit status passes through" "expected 37, got $rc"
fi
rm -rf "$DIR"

# --- Test 3: N concurrent acquires all succeed ---------------------------------------------------
DIR="$(mktemp -d)"
pids=()
ok=true
for ((n = 1; n <= SLOTS; n++)); do
  pids+=("$(start_holder "$DIR" "$DIR/holder-$n")")
  await_marker "$DIR/holder-$n" || ok=false
done
if [ "$ok" = true ]; then
  assert_pass "$SLOTS concurrent acquires all get a slot"
else
  assert_fail "$SLOTS concurrent acquires all get a slot" "a holder never reached its marker"
fi
kill_holders "${pids[@]}"
rm -rf "$DIR"

# --- Test 4: the N+1th concurrent acquire blocks -------------------------------------------------
DIR="$(mktemp -d)"
pids=()
for ((n = 1; n <= SLOTS; n++)); do
  pids+=("$(start_holder "$DIR" "$DIR/holder-$n")")
  await_marker "$DIR/holder-$n" || true
done
E2E_SLOT_DIR="$DIR" timeout 3 bash "$SCRIPT" true >/dev/null 2>&1 && rc=0 || rc=$?
if [ "$rc" -eq 124 ]; then
  assert_pass "the $((SLOTS + 1))th concurrent acquire blocks"
else
  assert_fail "the $((SLOTS + 1))th concurrent acquire blocks" "expected timeout 124, got $rc"
fi
kill_holders "${pids[@]}"
rm -rf "$DIR"

# --- Test 5: a SIGKILLed holder frees its slot ---------------------------------------------------
# The load-bearing property: the lock lives on an fd the kernel closes on process death, so there is
# no stale lock for a reaper to clean up and no reaper to write. A voluntarily-released lock — one an
# MCP server or an orchestrator hands out — cannot offer this.
DIR="$(mktemp -d)"
pids=()
for ((n = 1; n <= SLOTS; n++)); do
  pids+=("$(start_holder "$DIR" "$DIR/holder-$n")")
  await_marker "$DIR/holder-$n" || true
done
kill_holders "${pids[0]}"
if E2E_SLOT_DIR="$DIR" timeout 5 bash "$SCRIPT" true >/dev/null 2>&1; then
  assert_pass "a SIGKILLed holder frees its slot"
else
  assert_fail "a SIGKILLed holder frees its slot" "the freed slot was not reacquired within 5s"
fi
kill_holders "${pids[@]:1}"
rm -rf "$DIR"

# --- Test 6: --exclusive succeeds on an empty slot dir -------------------------------------------
DIR="$(mktemp -d)"
if E2E_SLOT_DIR="$DIR" bash "$SCRIPT" --exclusive true >/dev/null 2>&1; then
  assert_pass "empty slot dir: --exclusive runs the command, exits 0"
else
  assert_fail "empty slot dir: --exclusive runs the command, exits 0" "script exited non-zero"
fi
rm -rf "$DIR"

# --- Test 7: --exclusive blocks while a single slot is held --------------------------------------
# One slot, not all of them: this is the direction that bites, since a `db push` landing mid-suite
# leaves the run reading half-applied schema and failing in ways no spec author can diagnose.
DIR="$(mktemp -d)"
holder="$(start_holder "$DIR" "$DIR/holder-1")"
await_marker "$DIR/holder-1" || true
E2E_SLOT_DIR="$DIR" timeout 3 bash "$SCRIPT" --exclusive true >/dev/null 2>&1 && rc=0 || rc=$?
if [ "$rc" -eq 124 ]; then
  assert_pass "--exclusive blocks while one slot is held"
else
  assert_fail "--exclusive blocks while one slot is held" "expected timeout 124, got $rc"
fi
kill_holders "$holder"
rm -rf "$DIR"

# --- Test 8: an acquire blocks while --exclusive is held -----------------------------------------
DIR="$(mktemp -d)"
holder="$(start_holder "$DIR" "$DIR/holder-x" exclusive)"
await_marker "$DIR/holder-x" || true
E2E_SLOT_DIR="$DIR" timeout 3 bash "$SCRIPT" true >/dev/null 2>&1 && rc=0 || rc=$?
if [ "$rc" -eq 124 ]; then
  assert_pass "an acquire blocks while --exclusive is held"
else
  assert_fail "an acquire blocks while --exclusive is held" "expected timeout 124, got $rc"
fi
kill_holders "$holder"
rm -rf "$DIR"

# --- Test 9: a released --exclusive lets a waiting acquire through --------------------------------
# The mirror of 8. Without it, a script that simply never acquires anything would pass 4, 7 and 8 —
# "blocks" is only meaningful next to a case that proves it eventually doesn't.
DIR="$(mktemp -d)"
holder="$(start_holder "$DIR" "$DIR/holder-x" exclusive)"
await_marker "$DIR/holder-x" || true
kill_holders "$holder"
if E2E_SLOT_DIR="$DIR" timeout 5 bash "$SCRIPT" true >/dev/null 2>&1; then
  assert_pass "an acquire proceeds once --exclusive is released"
else
  assert_fail "an acquire proceeds once --exclusive is released" "still blocked 5s after release"
fi
rm -rf "$DIR"

# --- Test 10: no command is a usage error, not a silent success -----------------------------------
DIR="$(mktemp -d)"
E2E_SLOT_DIR="$DIR" bash "$SCRIPT" >/dev/null 2>&1 && rc=0 || rc=$?
if [ "$rc" -ne 0 ]; then
  assert_pass "no command: exits non-zero with usage"
else
  assert_fail "no command: exits non-zero with usage" "script exited 0"
fi
E2E_SLOT_DIR="$DIR" bash "$SCRIPT" --exclusive >/dev/null 2>&1 && rc=0 || rc=$?
if [ "$rc" -ne 0 ]; then
  assert_pass "--exclusive with no command: exits non-zero with usage"
else
  assert_fail "--exclusive with no command: exits non-zero with usage" "script exited 0"
fi
rm -rf "$DIR"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
