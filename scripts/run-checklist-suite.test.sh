#!/usr/bin/env bash

# Tests for scripts/run-checklist-suite.sh (#1607). Follows e2e-slot.test.sh's pattern: plain
# assert_pass/assert_fail counters, one throwaway fixture per case, no `set -e`.
#
# **The seam is a PATH shim plus a temp git repo, and the script under test is unmodified.** The
# script reaches outside itself two ways and each has its own interception point:
#
#   - external commands — `npx` (next build, next start, playwright ×3, supabase). A shim directory
#     prepended to PATH replaces exactly `npx` and nothing else, so **no real build ever runs**.
#   - sibling scripts — `bash scripts/{teardown-test-barn,e2e-slot,workflow-context}.sh`, all
#     resolved relative to `git rev-parse --show-toplevel`. A mktemp'd git repo holding the script
#     under test plus stub siblings covers those with no indirection at all.
#
# Overridable command variables — the acceptance criteria's other option — were rejected: they
# would put ~8 test-only variables into the 500-plus-line script every e2e run goes through,
# each one a fresh way to run it wrong, and they still could not intercept `curl` or `ss`.
#
# `curl`, `ss`, `node`, `git` and `timeout` are deliberately **not** stubbed, and the fake
# `next start` is a real `node` HTTP server on the real kernel-chosen port. So the readiness poll,
# `wait_for_port_release`, and the signal cases' "the server process group is gone" all run against
# a real listener rather than against a fixture that agrees with them.
#
# `e2e-slot.sh` is the **real** script, copied in, with `E2E_SLOT_DIR` pointed at a per-case temp
# dir. Never the machine-wide slot: this gate runs on a host where a sibling worktree may have a
# live suite in flight, and a test that took that lock would block behind it — or worse, take it.

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/run-checklist-suite.sh"
REAL_SLOT="$SCRIPT_DIR/e2e-slot.sh"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# --- Fixture -------------------------------------------------------------------------------------

# A temp git repo carrying the script under test, the real slot wrapper, stub siblings, a complete
# .env.local, and the shim bin dir. `git init` only — nothing here needs a commit, and the script's
# one `git ls-tree` (on the preflight's abort path) is already `|| true`.
make_repo() {
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q >/dev/null 2>&1
  mkdir -p "$dir/scripts" "$dir/shim" "$dir/state" "$dir/slots"

  cp "$SCRIPT" "$dir/scripts/run-checklist-suite.sh"
  cp "$REAL_SLOT" "$dir/scripts/e2e-slot.sh"

  # Two markers, and the split is the whole point. `teardown-started` appears the moment teardown
  # is entered; `teardown-called.log` appears only once it has run to *completion*. A stub that
  # wrote one marker immediately could not tell "teardown ran" from "teardown was entered and then
  # abandoned mid-call", which is exactly the failure the signal cases below exist to catch — and
  # is what the first cut of this harness missed. FAKE_TEARDOWN_SLEEP widens the real thing's
  # multi-second network call into an observable window a test can aim a signal into.
  cat > "$dir/scripts/teardown-test-barn.sh" <<'EOF'
#!/usr/bin/env bash
touch "$PWD/teardown-started"
sleep "${FAKE_TEARDOWN_SLEEP:-0}"
# To stdout as well as to the marker, because the real script prints here too: that output goes
# through the log writer, and it is what the terminator has to be ordered *after*.
echo "fake teardown-test-barn.sh: $*"
# FAKE_TEARDOWN_NOISE widens that output until it cannot fit in the pipes between this script and
# the log file, which is what gives the ordering case its forcing function (#1621). Written as a
# bash loop rather than `head -c … | tr | fold`, so nothing here depends on which coreutils the
# host ships — this host runs uutils, GitHub Actions runs GNU, and the two differ in places that
# already cost this script a review round.
if [ "${FAKE_TEARDOWN_NOISE:-0}" -gt 0 ]; then
  noise_line="$(printf 'x%.0s' {1..99})"
  for ((noise_i = 0; noise_i < FAKE_TEARDOWN_NOISE / 100; noise_i++)); do
    printf '%s\n' "$noise_line"
  done
fi
printf '%s\n' "$*" >> "$PWD/teardown-called.log"
EOF

  # Only reached on the preflight's abort path, where the real one would make `gh` round trips.
  cat > "$dir/scripts/workflow-context.sh" <<'EOF'
#!/usr/bin/env bash
echo "base=release/release-4"
EOF

  cat > "$dir/.env.local" <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://fake-dev.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=fake-anon-key
SUPABASE_SERVICE_ROLE_KEY=fake-service-role-key
DEV_SUPABASE_URL=https://fake-dev.supabase.co
CRON_SECRET=fake-cron-secret
EOF

  # The whole shim: one dispatcher on `npx`'s first argument. Everything else on PATH stays real.
  cat > "$dir/shim/npx" <<'EOF'
#!/usr/bin/env bash
tool="$1"
shift
case "$tool" in
  next)
    sub="$1"
    shift
    case "$sub" in
      build)
        if [ "${FAKE_BUILD_FAIL:-0}" = 1 ]; then
          echo "Failed to compile."
          echo "./src/app/page.tsx:1:1  Type error: fake type error for the harness"
          exit 1
        fi
        echo "fake next build: compiled successfully"
        exit 0
        ;;
      start)
        exec bash "$FAKE_BIN/fake-next-start" "$@"
        ;;
    esac
    ;;
  playwright)
    case "$1" in
      install-deps | install)
        exit 0
        ;;
      test)
        shift
        printf '%s\n' "$@" > "$FAKE_STATE/playwright-args"
        env | grep -E '^E2E_' | sort > "$FAKE_STATE/playwright-env"
        touch "$FAKE_STATE/playwright-started"
        if [ "${FAKE_PW_LEAK_STDOUT:-0}" = 1 ]; then
          # A leaked browser, reduced to its one load-bearing property: a descendant of Playwright
          # that outlives it **holding the suite script's stdout open** (#1607 finding B). There is
          # deliberately no redirect here — inheriting that descriptor is the whole fixture, and it
          # is why the log writer never sees EOF and an unbounded drain would hang `cleanup`.
          # Its own pid is recorded from inside so the harness kills exactly what this fixture
          # created; `setsid --fork` puts it in its own session, so the suite's process-group
          # signals cannot reach it and neither could a pattern match this file is not allowed.
          setsid --fork bash -c 'echo $$ > "$1"; exec sleep 120' _ "$FAKE_STATE/leaked-pid" &
          for _ in $(seq 1 50); do
            [ -s "$FAKE_STATE/leaked-pid" ] && break
            sleep 0.1
          done
        fi
        sleep "${FAKE_PW_SLEEP:-0}"
        exit "${FAKE_PW_EXIT:-0}"
        ;;
    esac
    ;;
  supabase)
    # `migration list`. Three fixtures, matching the three outcomes the preflight branches on.
    case "${FAKE_MIGRATION_MODE:-clean}" in
      fail) exit 1 ;;
      ahead)
        echo "   Local          | Remote         | Time (UTC)          "
        echo "  ----------------|----------------|---------------------"
        echo "  20260101000000  | 20260101000000 | 2026-01-01 00:00:00 "
        echo "                  | 20260817123456 | 2026-08-17 12:34:56 "
        exit 0
        ;;
      *)
        echo "   Local          | Remote         | Time (UTC)          "
        echo "  ----------------|----------------|---------------------"
        echo "  20260101000000  | 20260101000000 | 2026-01-01 00:00:00 "
        exit 0
        ;;
    esac
    ;;
esac
echo "harness shim: unstubbed 'npx $tool $*'" >&2
exit 127
EOF

  # A real listener on the port the script's own `node -e` picked from the kernel, so the readiness
  # `curl` and `wait_for_port_release`'s `ss` are exercised rather than bypassed.
  #
  # FAKE_SERVER_TERM_GRACE holds the port open for N seconds after the first SIGTERM. That is what
  # gives the signal cases a *bounded, observable* escalation window to deliver their second signal
  # into — the alternative, letting stop_server run its full 15s budget out to SIGKILL, would put
  # 45s on this gate to assert the same thing.
  cat > "$dir/shim/fake-next-start" <<'EOF'
#!/usr/bin/env bash
port=""
while [ $# -gt 0 ]; do
  case "$1" in
    -p) port="$2"; shift 2 ;;
    -H) shift 2 ;;
    *) shift ;;
  esac
done

if [ "${FAKE_START_EADDRINUSE:-0}" -gt 0 ]; then
  attempts=$(cat "$FAKE_STATE/start-attempts" 2>/dev/null || echo 0)
  attempts=$((attempts + 1))
  echo "$attempts" > "$FAKE_STATE/start-attempts"
  if [ "$attempts" -le "${FAKE_START_EADDRINUSE}" ]; then
    echo "Error: listen EADDRINUSE: address already in use 127.0.0.1:$port"
    exit 1
  fi
fi

echo "$port" >> "$FAKE_STATE/server-ports"
# Written before the exec, and the exec keeps the pid — so this is the pid the signal cases assert
# is gone, derived from our own fixture rather than pattern-matched out of `ps`.
echo "$$" > "$FAKE_STATE/server-pid"
exec node -e '
const http = require("http");
const port = Number(process.argv[1]);
const grace = Number(process.env.FAKE_SERVER_TERM_GRACE || 0);
const server = http.createServer((req, res) => { res.writeHead(200); res.end("ok"); });
server.listen(port, "127.0.0.1");
if (grace > 0) {
  let leaving = false;
  process.on("SIGTERM", () => {
    if (leaving) return;
    leaving = true;
    // The escalation window opened. Recorded as a file rather than left for a test to infer from
    // the suite log: the log travels through a `tee` that a group signal can kill, so on a host
    // where it does, a case synchronising on a log line waits out its timeout and delivers its
    // second signal to an already-finished run. That is a test that silently stops testing.
    require("fs").writeFileSync(process.env.FAKE_STATE + "/server-got-term", "");
    setTimeout(() => process.exit(0), grace * 1000);
  });
}
' "$port"
EOF

  chmod +x "$dir/shim/npx" "$dir/shim/fake-next-start"
  echo "$dir"
}

# Kills only what this fixture started, by the pid the fixture itself recorded. Never a pattern
# match on a process name: every worktree on this host runs scripts with these names, so a pattern
# match here could kill a colleague's live suite.
kill_repo_server() {
  local pid
  pid="$(cat "$1/state/server-pid" 2>/dev/null || true)"
  if [ -n "$pid" ]; then
    kill -9 "$pid" 2>/dev/null || true
  fi
}

# The suite script itself, killed by the *process group* the fixture put it in — `start_suite`
# writes its own `$$` after `setsid`, so this pgid is one this file minted and nothing else can be
# in it. Needed because every `await_*` here is bounded and therefore can time out: without this a
# failing signal case would `rm -rf` the repo out from under a still-running detached script, whose
# own `setsid` server would then outlive the whole test file and hold an ephemeral port. On a CI
# host that accumulates one per failed run.
kill_repo_suite() {
  local pid
  pid="$(cat "$1/state/suite-pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; then
    kill -9 -"$pid" 2>/dev/null || true
  fi
}

# The FAKE_PW_LEAK_STDOUT holder, killed by the pid the fixture itself recorded. It is in its own
# session precisely so the suite's group signals cannot reach it, which means nothing else in this
# file's teardown reaches it either — without this it would sit for its full 120s holding a pipe.
kill_repo_leak() {
  local pid
  pid="$(cat "$1/state/leaked-pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
}

cleanup_repo() {
  kill_repo_suite "$1"
  kill_repo_server "$1"
  kill_repo_leak "$1"
  rm -rf "$1"
}

# Runs the script to completion in $REPO. Output goes to the log file the script maintains, never
# to a capture — reading it through `$(...)` would leave this shell holding the read end of the
# `tee` process substitution's pipe, which is e2e-slot.test.sh's documented hang.
#
# stdin is /dev/null so --hold-open's `read` returns immediately instead of blocking the gate.
# The terminator wait is not padding. The script's stdout is an `exec > >(tee …)` process
# substitution, and bash does not wait for a process substitution to drain before the script's own
# exit status is reported — so the last lines can still be in flight when this function returns, and
# a `grep` racing them reads a log that is missing its own final line.
run_suite() {
  local rc=0
  (
    cd "$REPO" || exit 1
    PATH="$REPO/shim:$PATH" \
    FAKE_STATE="$REPO/state" \
    FAKE_BIN="$REPO/shim" \
    E2E_SLOT_DIR="$REPO/slots" \
      bash scripts/run-checklist-suite.sh "$@" >/dev/null 2>&1 < /dev/null
  ) || rc=$?
  await_log "run-checklist-suite.sh exited" 100
  return "$rc"
}

# Same, but in its own session so a case can signal the script's whole process **group** — which is
# the delivery that matters (see the signal section's comment). `exec` keeps the pid it records, so
# the pid in the file is the script's own and the group id equals it.
#
# `SUITE_STDOUT` (default `/dev/null`) is where the run's stdout goes. Test 30 points it at a pipe
# it deliberately never drains; every other caller wants it discarded. It is a variable rather than
# an argument because the redirect has to sit on this function's own `setsid` call, and because a
# case that forgets it gets the safe default.
SUITE_PID=
start_suite() {
  # Cleared first. A previous case's pid left in this global is a live pgid on this host, and the
  # `kill -SIG -$SUITE_PID` below would then signal it — or, if the pid has been recycled, whatever
  # inherited it. Every caller checks the return value.
  SUITE_PID=
  PATH="$REPO/shim:$PATH" \
  FAKE_STATE="$REPO/state" \
  FAKE_BIN="$REPO/shim" \
  E2E_SLOT_DIR="$REPO/slots" \
    setsid --fork bash -c '
      cd "$1" || exit 1
      echo $$ > "$1/state/suite-pid"
      shift
      exec bash scripts/run-checklist-suite.sh "$@"
    ' _ "$REPO" "$@" > "${SUITE_STDOUT:-/dev/null}" 2>&1 < /dev/null
  # Two mechanics here, and getting either wrong silently destroys what these cases assert.
  #
  # **No `&`.** Bash sets SIGINT and SIGQUIT to SIG_IGN in a command it runs asynchronously, and a
  # signal that is SIG_IGN on entry to a shell **cannot be trapped** — so under `&` the script's own
  # `trap 'exit 130' INT` was a silent no-op, the run sailed past the Ctrl-C to `exit "$PW_EXIT"`,
  # and the terminator read `exited 0`. That is indistinguishable from the forged-green defect these
  # tests exist to catch, in a script where it does not occur: the pre-#1607 script was instrumented
  # and fails identically under `&`, so the tell was a harness artifact, not a finding.
  #
  # **`--fork`, not bare `setsid`.** Bare `setsid` only forks when its caller is already a process
  # group leader, and otherwise `exec`s — so whether this call blocks until the whole run finishes
  # depends on how the harness itself was invoked. `--fork` makes it unconditional, and the forked
  # child still inherits this shell's default dispositions rather than an async shell's SIG_IGN.
  await_file "$REPO/state/suite-pid" 100 || return 1
  SUITE_PID="$(cat "$REPO/state/suite-pid")"
}

await_file() {
  local path="$1" tries="${2:-100}" i
  for ((i = 0; i < tries; i++)); do
    [ -e "$path" ] && return 0
    sleep 0.1
  done
  return 1
}

await_log() {
  local pattern="$1" tries="${2:-300}" i
  for ((i = 0; i < tries; i++)); do
    grep -q -- "$pattern" "$REPO/checklist-suite.log" 2>/dev/null && return 0
    sleep 0.1
  done
  return 1
}

log_has() {
  grep -q -- "$1" "$REPO/checklist-suite.log" 2>/dev/null
}

# The exit code the terminator actually reports, so a signal case can assert *which* status was
# written rather than merely that some terminator exists. Without this, `exited 0` — the forged
# green a missing TERM trap produces, and the single worst outcome here since #1602's merge gate
# parses this line — satisfies an assertion written to catch it.
terminator_code() {
  sed -n 's/.*run-checklist-suite\.sh exited \([0-9][0-9]*\) .*/\1/p' \
    "$REPO/checklist-suite.log" 2>/dev/null | tail -1
}

# The terminator's **position**, which is a strictly stronger claim than `log_has` (#1621). Presence
# is what a bare `printf >> "$LOG_PATH"` buys on its own; position is what the bounded drain buys,
# and it is what `/testIssue` Step 4 and `/overnightRefactor` have always described the log as
# having. Only test 30 can make this fail on demand — see the comment there.
terminator_is_last() {
  case "$(tail -1 "$REPO/checklist-suite.log" 2>/dev/null)" in
    "=== run-checklist-suite.sh exited "*) return 0 ;;
  esac
  return 1
}

# Signals the suite's process group, and refuses to do it to a pid that is empty or already dead.
# Both refusals are failures of the *test*, not of the script: a signal case whose signal landed on
# nothing asserts only what the preceding signal already established, and passes whether or not the
# behaviour under test exists. SIGNAL_OK is what each case checks to tell those apart.
SIGNAL_OK=true
signal_group() {
  if [ -z "$SUITE_PID" ] || ! kill -0 "$SUITE_PID" 2>/dev/null; then
    SIGNAL_OK=false
    return 1
  fi
  kill -"$1" -"$SUITE_PID" 2>/dev/null
}

pw_args() {
  tr '\n' ' ' < "$REPO/state/playwright-args" 2>/dev/null
}

# --- Arg parsing ---------------------------------------------------------------------------------

# Test 1: an unknown flag is a usage error, and the terminator still reaches the log.
# The terminator half is the load-bearing one: the EXIT trap is installed before arg parsing
# precisely so a bad flag gets one, and #1602's merge gate waits on its presence.
REPO="$(make_repo)"
run_suite --no-recycle && rc=0 || rc=$?
if [ "$rc" -ne 0 ] && log_has "unknown argument" && log_has "run-checklist-suite.sh exited"; then
  assert_pass "unknown flag: exits non-zero, usage and terminator in the log"
else
  assert_fail "unknown flag: exits non-zero, usage and terminator in the log" "exit=$rc"
fi
cleanup_repo "$REPO"

# Test 2: --base-url with no value is an error rather than a run against a bogus origin.
REPO="$(make_repo)"
run_suite --base-url && rc=0 || rc=$?
if [ "$rc" -ne 0 ] && log_has "base-url requires an origin"; then
  assert_pass "--base-url with no value: exits non-zero"
else
  assert_fail "--base-url with no value: exits non-zero" "exit=$rc"
fi
cleanup_repo "$REPO"

# Test 3: a flag-shaped value is treated as a missing one, not silently absorbed.
# Absorbing it would drop the following flag *and* run against an origin named "--hold-open".
REPO="$(make_repo)"
run_suite --base-url --hold-open && rc=0 || rc=$?
if [ "$rc" -ne 0 ] && log_has "base-url requires an origin"; then
  assert_pass "--base-url followed by a flag: not absorbed, exits non-zero"
else
  assert_fail "--base-url followed by a flag: not absorbed, exits non-zero" "exit=$rc"
fi
cleanup_repo "$REPO"

# Test 4: --spec with no value, the same shape on the other repeatable flag.
REPO="$(make_repo)"
run_suite --spec && rc=0 || rc=$?
if [ "$rc" -ne 0 ] && log_has "spec requires a spec path"; then
  assert_pass "--spec with no value: exits non-zero"
else
  assert_fail "--spec with no value: exits non-zero" "exit=$rc"
fi
cleanup_repo "$REPO"

# Test 5: --allow-prod without --base-url is refused. Without the refusal the run seeds the target
# project and then drives a server it builds itself off that same target-pointed .env.local.
REPO="$(make_repo)"
run_suite --allow-prod && rc=0 || rc=$?
if [ "$rc" -ne 0 ] && log_has "allow-prod requires --base-url"; then
  assert_pass "--allow-prod without --base-url: exits non-zero"
else
  assert_fail "--allow-prod without --base-url: exits non-zero" "exit=$rc"
fi
cleanup_repo "$REPO"

# Test 6: --base-url skips the build and the start entirely, and is the origin Playwright is given.
# A --base-url run must never start — or kill — a server, which is what the kill path's SERVER_PGID
# guard rests on.
REPO="$(make_repo)"
run_suite --base-url http://127.0.0.1:9999 && rc=0 || rc=$?
if [ "$rc" -eq 0 ] &&
  [ ! -e "$REPO/state/server-ports" ] &&
  [ ! -e "$REPO/checklist-build.log" ] &&
  grep -q '^E2E_BASE_URL=http://127.0.0.1:9999$' "$REPO/state/playwright-env" 2>/dev/null; then
  assert_pass "--base-url: no build, no server, and it is the origin Playwright gets"
else
  assert_fail "--base-url: no build, no server, and it is the origin Playwright gets" "exit=$rc"
fi
cleanup_repo "$REPO"

# Test 7: --spec is repeatable and both reach Playwright, alongside the default @visual exclusion.
REPO="$(make_repo)"
run_suite --base-url http://127.0.0.1:9999 --spec e2e/a.spec.ts --spec e2e/b.spec.ts >/dev/null 2>&1
if [ "$(pw_args)" = "--grep-invert @visual e2e/a.spec.ts e2e/b.spec.ts " ]; then
  assert_pass "--spec is repeatable and both specs reach Playwright"
else
  assert_fail "--spec is repeatable and both specs reach Playwright" "args=$(pw_args)"
fi
cleanup_repo "$REPO"

# Test 8: --interactive swaps the @visual exclusion for --headed.
# The two are mutually exclusive by construction — a headed run is the one that shows @visual.
REPO="$(make_repo)"
run_suite --base-url http://127.0.0.1:9999 --interactive >/dev/null 2>&1
if [ "$(pw_args)" = "--headed " ]; then
  assert_pass "--interactive runs headed and drops the @visual exclusion"
else
  assert_fail "--interactive runs headed and drops the @visual exclusion" "args=$(pw_args)"
fi
cleanup_repo "$REPO"

# Test 9: --hold-open reaches the suite, and its prompt hitting EOF does not fail a passing run.
# `read` returns non-zero on a closed stdin, which under `set -e` would report a failure for a
# suite that passed — the `|| true` at that call site is what this pins.
REPO="$(make_repo)"
run_suite --base-url http://127.0.0.1:9999 --hold-open && rc=0 || rc=$?
if [ "$rc" -eq 0 ] && grep -q '^E2E_HOLD_OPEN=true$' "$REPO/state/playwright-env" 2>/dev/null; then
  assert_pass "--hold-open reaches the suite and EOF on its prompt keeps a passing run green"
else
  assert_fail "--hold-open reaches the suite and EOF on its prompt keeps a passing run green" "exit=$rc"
fi
cleanup_repo "$REPO"

# --- Environment bails ---------------------------------------------------------------------------

# Test 10: no .env.local. The terminator assertion is again the point — this bail is upstream of
# everything and is the earliest path the trap has to cover.
REPO="$(make_repo)"
rm -f "$REPO/.env.local"
run_suite && rc=0 || rc=$?
if [ "$rc" -ne 0 ] && log_has ".env.local not found" && log_has "run-checklist-suite.sh exited"; then
  assert_pass "missing .env.local: exits non-zero with a terminator in the log"
else
  assert_fail "missing .env.local: exits non-zero with a terminator in the log" "exit=$rc"
fi
cleanup_repo "$REPO"

# Test 11: a missing required var names itself. CRON_SECRET rather than one of the older three
# (#1424): it is the one whose absence would otherwise leave two `(e2e:)` checklist lines whose
# assertions silently never ran.
REPO="$(make_repo)"
grep -v '^CRON_SECRET=' "$REPO/.env.local" > "$REPO/.env.local.tmp" && mv "$REPO/.env.local.tmp" "$REPO/.env.local"
run_suite && rc=0 || rc=$?
if [ "$rc" -ne 0 ] && log_has "CRON_SECRET is not set"; then
  assert_pass "missing CRON_SECRET: exits non-zero naming the var"
else
  assert_fail "missing CRON_SECRET: exits non-zero naming the var" "exit=$rc"
fi
cleanup_repo "$REPO"

# Test 11a: a var left at its `.env.example` placeholder is rejected the same way an unset one is
# (#1619). Numbered 11a rather than 12 to avoid renumbering every case below it — this sits with
# the bail it extends, and the tests it would otherwise have pushed down are being appended to
# concurrently.
#
# `<random-secret>` is the exact string `.env.example` shipped on line 11 until this issue, and
# `CRON_SECRET` is the variable where copy-through actually cost something: `/api/cron/reset-demo`
# compares it to the request's `Authorization` header, so a copied-through value left the
# demo-reaper endpoint guarded by a published string. Empty was already the correct sentinel here
# — the loop rejects it, and the route 401s on it — and the placeholder was the one value that
# defeated both.
#
# Three assertions, and the third is the one that means "before the run starts" rather than merely
# "exits non-zero eventually": `state/playwright-args` is written by the `npx` shim the moment
# Playwright is invoked, so its **absence** is what proves the bail is upstream of the run. The
# terminator assertion is the other half — the `EXIT` trap is installed above these checks
# precisely so early bails still write it, and #1602's merge gate parses that line.
REPO="$(make_repo)"
sed -i 's/^CRON_SECRET=.*/CRON_SECRET=<random-secret>/' "$REPO/.env.local"
run_suite && rc=0 || rc=$?
if [ "$rc" -ne 0 ] &&
  log_has "CRON_SECRET is still the .env.example placeholder" &&
  log_has "run-checklist-suite.sh exited" &&
  [ ! -e "$REPO/state/playwright-args" ]; then
  assert_pass "placeholder CRON_SECRET: aborts before the run starts, naming the var, with a terminator"
else
  assert_fail "placeholder CRON_SECRET: aborts before the run starts, naming the var, with a terminator" \
    "exit=$rc playwright_invoked=$([ -e "$REPO/state/playwright-args" ] && echo yes || echo no)"
fi
cleanup_repo "$REPO"

# --- Schema preflight (#1599) --------------------------------------------------------------------

# Test 12: a DB ahead of the branch aborts before the build, naming the version.
# "Before the build" is half the criterion: the preflight sits where it does so an abort pays for
# neither a build nor an e2e slot.
REPO="$(make_repo)"
FAKE_MIGRATION_MODE=ahead run_suite && rc=0 || rc=$?
if [ "$rc" -ne 0 ] &&
  log_has "schema is ahead of this branch" &&
  log_has "20260817123456" &&
  [ ! -e "$REPO/checklist-build.log" ] &&
  [ ! -e "$REPO/state/playwright-started" ]; then
  assert_pass "schema-ahead preflight aborts before the build, naming the version"
else
  assert_fail "schema-ahead preflight aborts before the build, naming the version" "exit=$rc"
fi
cleanup_repo "$REPO"

# Test 13: the preflight failing is a note, not an abort. A preflight must never itself become the
# reason a suite cannot start.
REPO="$(make_repo)"
FAKE_MIGRATION_MODE=fail run_suite && rc=0 || rc=$?
if [ "$rc" -eq 0 ] && log_has "schema preflight skipped" && [ -e "$REPO/state/playwright-started" ]; then
  assert_pass "an unanswerable preflight notes and proceeds"
else
  assert_fail "an unanswerable preflight notes and proceeds" "exit=$rc"
fi
cleanup_repo "$REPO"

# Test 14: --allow-prod skips the preflight outright — `migration list` compares against the linked
# project, which is not the project an --allow-prod run drives.
REPO="$(make_repo)"
FAKE_MIGRATION_MODE=ahead run_suite --allow-prod --base-url http://127.0.0.1:9999 && rc=0 || rc=$?
if [ "$rc" -eq 0 ] && log_has "Skipping the schema preflight"; then
  assert_pass "--allow-prod skips the schema preflight"
else
  assert_fail "--allow-prod skips the schema preflight" "exit=$rc"
fi
cleanup_repo "$REPO"

# --- Build and server start ----------------------------------------------------------------------

# Test 15: a failed build aborts before Playwright, with its tail in the log rather than only
# behind a log path — the `exec` redirect is what puts it where every reader already looks.
REPO="$(make_repo)"
FAKE_BUILD_FAIL=1 run_suite && rc=0 || rc=$?
if [ "$rc" -ne 0 ] &&
  log_has "'next build' failed" &&
  log_has "fake type error for the harness" &&
  [ ! -e "$REPO/state/playwright-started" ]; then
  assert_pass "a failed build aborts before Playwright, tail in the log"
else
  assert_fail "a failed build aborts before Playwright, tail in the log" "exit=$rc"
fi
cleanup_repo "$REPO"

# Test 16: losing the port race once retries on a fresh port and the run still completes.
# The window between the kernel handing the port out and `next start` binding it is small but real,
# and the explicit -p disables Next's port-hunting fallback, so the only symptom is EADDRINUSE in
# the server log.
REPO="$(make_repo)"
FAKE_START_EADDRINUSE=1 run_suite && rc=0 || rc=$?
ports="$(wc -l < "$REPO/state/server-ports" 2>/dev/null || echo 0)"
if [ "$rc" -eq 0 ] && log_has "retrying on a fresh port" && [ "$ports" -eq 1 ]; then
  assert_pass "EADDRINUSE on the first attempt retries and the run completes"
else
  assert_fail "EADDRINUSE on the first attempt retries and the run completes" "exit=$rc ports=$ports"
fi
cleanup_repo "$REPO"

# Test 17: losing it twice gives up, and says so in terms of attempts rather than of a timeout that
# never elapsed.
REPO="$(make_repo)"
FAKE_START_EADDRINUSE=2 run_suite && rc=0 || rc=$?
if [ "$rc" -ne 0 ] && log_has "after 2 attempts" && [ ! -e "$REPO/state/playwright-started" ]; then
  assert_pass "EADDRINUSE on both attempts gives up before Playwright"
else
  assert_fail "EADDRINUSE on both attempts gives up before Playwright" "exit=$rc"
fi
cleanup_repo "$REPO"

# Test 18: the default path builds, starts, runs, and leaves no server behind — the script's own
# contract ("a run leaves no server behind") asserted from outside it.
#
# The assertion is that *our* server process is gone, not that its port is free. Those are not the
# same claim on a shared machine: the port is ephemeral, and the ephemeral range is also where every
# other process's outbound sockets come from, so a sibling worktree's suite can bind it in the
# window between this run exiting and this line running — failing the case for a correct script.
# The pid comes from the fixture's own record, so it names exactly what this run started.
#
# The `terminator_is_last` clause rides along free (#1621). It is deliberately **not** the forcing
# function for the ordering property — on this path the writer drains in milliseconds either way,
# so it would pass with the drain removed. Test 30 owns that; this one only pins that the ordinary
# path, which is every real run, actually exhibits what the two skills describe.
REPO="$(make_repo)"
run_suite && rc=0 || rc=$?
port="$(head -1 "$REPO/state/server-ports" 2>/dev/null || true)"
server_pid="$(cat "$REPO/state/server-pid" 2>/dev/null || true)"
if [ "$rc" -eq 0 ] && [ -n "$port" ] && [ -n "$server_pid" ] &&
  ! kill -0 "$server_pid" 2>/dev/null &&
  [ -e "$REPO/teardown-called.log" ] &&
  terminator_is_last; then
  assert_pass "default run: builds, serves, tears down, leaves no server behind, terminator last"
else
  assert_fail "default run: builds, serves, tears down, leaves no server behind, terminator last" \
    "exit=$rc port=$port server_pid=$server_pid alive=$(kill -0 "${server_pid:-0}" 2>/dev/null && echo yes || echo no) last='$(tail -1 "$REPO/checklist-suite.log" 2>/dev/null)'"
fi
cleanup_repo "$REPO"

# --- Exit-code terminator ------------------------------------------------------------------------

# Test 19: a green run's terminator reports 0 and the script exits 0.
REPO="$(make_repo)"
run_suite --base-url http://127.0.0.1:9999 && rc=0 || rc=$?
if [ "$rc" -eq 0 ] && log_has "run-checklist-suite.sh exited 0"; then
  assert_pass "green run: terminator reports 0 and the script exits 0"
else
  assert_fail "green run: terminator reports 0 and the script exits 0" "exit=$rc"
fi
cleanup_repo "$REPO"

# Test 20: Playwright's own status is what both the terminator and the script report.
# `/testIssue` Step 4 and #1602's merge gate parse that line, so a swallowed non-zero reports a
# failing suite as green to both.
REPO="$(make_repo)"
FAKE_PW_EXIT=37 run_suite --base-url http://127.0.0.1:9999 && rc=0 || rc=$?
if [ "$rc" -eq 37 ] && log_has "run-checklist-suite.sh exited 37"; then
  assert_pass "a failing suite: terminator and exit status both report Playwright's 37"
else
  assert_fail "a failing suite: terminator and exit status both report Playwright's 37" "exit=$rc"
fi
cleanup_repo "$REPO"

# --- Signal contract -----------------------------------------------------------------------------

# Measured on bash 5.3.9 while writing these, and the reason every case below signals a **process
# group** rather than a pid:
#
#   - `kill -TERM <script-pid>` delivered while the EXIT trap is running does NOT abandon the
#     handler. The trap completes and bash re-raises afterwards.
#   - `kill -TERM -<pgid>` DOES abandon it, because it also kills the `sleep` the handler is
#     sitting in. That is what a terminal Ctrl-C's own process group, a `kill -- -PGID`, and a CI
#     wrapper's own timeout escalation all deliver — so it is the shape that actually occurs.
#   - The fix works because an *ignored* disposition is inherited across `exec`: `trap '' TERM`
#     protects the handler's own children as well as the shell, which a caught disposition would
#     not (it resets to default in the child).
#
# Five shapes, no two alike, and each pins the exit code the terminator reports rather than merely
# its presence. The vulnerable region is the **whole** `EXIT` handler — stop the server, tear the
# barns down, write the terminator — not just the kill-and-escalate window, so cases 24 and 25 aim
# their signal at the teardown half. That is the half the first cut of this file left uncovered,
# and both gaps it hid were real.
#
# Each waits on a log line or a marker rather than sleeping a fixed amount, so a slow machine
# delays the test instead of turning it into a coin flip, and each asserts SIGNAL_OK so a signal
# that landed on an already-dead process is reported as a broken test rather than a pass.

# Test 21: INT, then TERM **mid-escalation**, on a run that started its own server.
# The reproduction #1601's review did by hand: server process group gone, teardown RAN TO
# COMPLETION, and the terminator reports the INT's own 130 rather than being lost or forged.
REPO="$(make_repo)"
SIGNAL_OK=true
FAKE_PW_SLEEP=30 FAKE_SERVER_TERM_GRACE=4 start_suite && started=true || started=false
if [ "$started" = true ]; then
  await_file "$REPO/state/playwright-started" 600
  signal_group INT
  # Synchronised on the server's own marker, not on the log's "Stopping this run's…" line: see the
  # SIGTERM handler in the fixture. The window this aims into is between that marker and the
  # server exiting FAKE_SERVER_TERM_GRACE seconds later.
  await_file "$REPO/state/server-got-term" 600
  sleep 0.5
  signal_group TERM
  await_log "run-checklist-suite.sh exited" 400
fi
server_pid="$(cat "$REPO/state/server-pid" 2>/dev/null || true)"
if [ "$started" = true ] && [ "$SIGNAL_OK" = true ] &&
  ! kill -0 "${server_pid:-0}" 2>/dev/null &&
  [ -e "$REPO/teardown-called.log" ] &&
  [ "$(terminator_code)" = "130" ]; then
  assert_pass "INT then TERM mid-escalation: server gone, teardown completed, terminator 130"
else
  assert_fail "INT then TERM mid-escalation: server gone, teardown completed, terminator 130" \
    "started=$started signalled=$SIGNAL_OK server_pid=$server_pid teardown=$([ -e "$REPO/teardown-called.log" ] && echo done || echo no) code=$(terminator_code)"
fi
cleanup_repo "$REPO"

# Test 22: a bare HUP, no INT first. HUP is what a closed terminal or a dropped ssh session
# delivers, and it reaches the top-level trap by a different route than test 21's masked
# mid-escalation signal — so this is the case that pins `trap 'exit 129' HUP` specifically.
REPO="$(make_repo)"
SIGNAL_OK=true
FAKE_PW_SLEEP=30 start_suite && started=true || started=false
if [ "$started" = true ]; then
  await_file "$REPO/state/playwright-started" 600
  signal_group HUP
  await_log "run-checklist-suite.sh exited" 400
fi
if [ "$started" = true ] && [ "$SIGNAL_OK" = true ] &&
  [ -e "$REPO/teardown-called.log" ] &&
  [ "$(terminator_code)" = "129" ]; then
  assert_pass "bare HUP: teardown completed, terminator reports 129"
else
  assert_fail "bare HUP: teardown completed, terminator reports 129" \
    "started=$started signalled=$SIGNAL_OK teardown=$([ -e "$REPO/teardown-called.log" ] && echo done || echo no) code=$(terminator_code)"
fi
cleanup_repo "$REPO"

# Test 23: a bare TERM — the *false green* half, and the most dangerous of the five.
# With no TERM trap the EXIT handler still runs, but with `$?` still 0, so the terminator says
# `exited 0` for a run that was killed and #1602's merge gate reads it as a passing suite.
# Asserting the code rather than the line's presence is the entire point of this case.
REPO="$(make_repo)"
SIGNAL_OK=true
FAKE_PW_SLEEP=30 start_suite && started=true || started=false
if [ "$started" = true ]; then
  await_file "$REPO/state/playwright-started" 600
  signal_group TERM
  await_log "run-checklist-suite.sh exited" 400
fi
if [ "$started" = true ] && [ "$SIGNAL_OK" = true ] &&
  [ -e "$REPO/teardown-called.log" ] &&
  [ "$(terminator_code)" = "143" ]; then
  assert_pass "bare TERM: teardown completed, terminator reports 143 rather than a false 0"
else
  assert_fail "bare TERM: teardown completed, terminator reports 143 rather than a false 0" \
    "started=$started signalled=$SIGNAL_OK teardown=$([ -e "$REPO/teardown-called.log" ] && echo done || echo no) code=$(terminator_code)"
fi
cleanup_repo "$REPO"

# Test 24: INT, then a **second** signal during the barn teardown.
# `stop_server` is not the only vulnerable region: `cleanup` goes on to run teardown-test-barn.sh —
# a multi-second network call — and only then writes the terminator. A fence that covers the
# escalation and is dropped before teardown leaves both of this issue's failure modes open on a
# plain double Ctrl-C, or a CI wrapper's TERM-then-TERM. HUP as the second signal so this case and
# test 21 differ in both the region signalled and the signal used.
REPO="$(make_repo)"
SIGNAL_OK=true
FAKE_PW_SLEEP=30 FAKE_TEARDOWN_SLEEP=4 start_suite && started=true || started=false
if [ "$started" = true ]; then
  await_file "$REPO/state/playwright-started" 600
  signal_group INT
  await_file "$REPO/teardown-started" 600
  sleep 0.5
  signal_group HUP
  await_log "run-checklist-suite.sh exited" 400
fi
if [ "$started" = true ] && [ "$SIGNAL_OK" = true ] &&
  [ -e "$REPO/teardown-called.log" ] &&
  [ "$(terminator_code)" = "130" ]; then
  assert_pass "a second signal during teardown: teardown still completed, terminator 130"
else
  assert_fail "a second signal during teardown: teardown still completed, terminator 130" \
    "started=$started signalled=$SIGNAL_OK teardown=$([ -e "$REPO/teardown-called.log" ] && echo done || echo no) code=$(terminator_code)"
fi
cleanup_repo "$REPO"

# Test 25: the same, on a --base-url run — where a *single* signal is enough.
# `stop_server` returns at its `[ -z "$SERVER_PGID" ]` guard, and #1601 made SERVER_PGID empty on
# exactly the paths that never start a server: every --base-url run (the shape `--allow-prod`
# requires, and the one a developer targeting their own dev server spells) and every path where
# start_server gave up. Any fence living inside stop_server is therefore never installed at all on
# those runs, and one group TERM mid-teardown leaks the barns and loses the terminator.
REPO="$(make_repo)"
SIGNAL_OK=true
FAKE_PW_SLEEP=30 FAKE_TEARDOWN_SLEEP=4 start_suite --base-url http://127.0.0.1:9999 && started=true || started=false
if [ "$started" = true ]; then
  await_file "$REPO/state/playwright-started" 600
  signal_group INT
  await_file "$REPO/teardown-started" 600
  sleep 0.5
  signal_group TERM
  await_log "run-checklist-suite.sh exited" 400
fi
if [ "$started" = true ] && [ "$SIGNAL_OK" = true ] &&
  [ ! -e "$REPO/state/server-ports" ] &&
  [ -e "$REPO/teardown-called.log" ] &&
  [ "$(terminator_code)" = "130" ]; then
  assert_pass "--base-url run signalled during teardown: teardown still completed, terminator 130"
else
  assert_fail "--base-url run signalled during teardown: teardown still completed, terminator 130" \
    "started=$started signalled=$SIGNAL_OK teardown=$([ -e "$REPO/teardown-called.log" ] && echo done || echo no) code=$(terminator_code)"
fi
cleanup_repo "$REPO"

# Test 27: a SIGKILLed run still closes its caller's stdout.
# Every consumer of this script reads its stdout to EOF in the background (`/testIssue` Step 4,
# `/fableFleet` Step 5). The script's own comment names SIGKILL as the one thing its EXIT trap
# cannot survive, and `setsid` means the server outlives it — so any descriptor the server inherits
# from the caller's stdout keeps that pipe open forever and the reader never returns. A hung
# consumer is worse than a failed run: it reports nothing at all.
REPO="$(make_repo)"
mkfifo "$REPO/caller-pipe"
( timeout 25 cat "$REPO/caller-pipe" > /dev/null; echo $? > "$REPO/state/reader-rc" ) &
reader_job=$!
PATH="$REPO/shim:$PATH" \
FAKE_STATE="$REPO/state" \
FAKE_BIN="$REPO/shim" \
FAKE_PW_SLEEP=60 \
E2E_SLOT_DIR="$REPO/slots" \
  setsid --fork bash -c '
    cd "$1" || exit 1
    echo $$ > "$1/state/suite-pid"
    exec bash scripts/run-checklist-suite.sh
  ' _ "$REPO" > "$REPO/caller-pipe" 2>/dev/null < /dev/null
# Every precondition is checked, because each one failing would otherwise make this case pass for
# the wrong reason: if the run never started a server there is nothing holding the caller's pipe,
# every writer is already gone, `cat` returns 0, and the assertion below is satisfied by a run that
# never tested anything. This is the same vacuity `signal_group` guards against elsewhere.
started27=true
await_file "$REPO/state/suite-pid" 100 || started27=false
SUITE_PID="$(cat "$REPO/state/suite-pid" 2>/dev/null || true)"
await_file "$REPO/state/playwright-started" 600 || started27=false
await_file "$REPO/state/server-pid" 100 || started27=false
if [ -z "$SUITE_PID" ] || ! kill -0 "$SUITE_PID" 2>/dev/null; then
  started27=false
else
  # SIGKILL, by the pgid this fixture minted — the one signal the EXIT trap cannot handle.
  kill -9 -"$SUITE_PID" 2>/dev/null
fi
wait "$reader_job" 2>/dev/null
reader_rc="$(cat "$REPO/state/reader-rc" 2>/dev/null || echo missing)"
if [ "$started27" = true ] && [ "$reader_rc" = "0" ]; then
  assert_pass "a SIGKILLed run closes its caller's stdout instead of hanging it"
else
  assert_fail "a SIGKILLed run closes its caller's stdout instead of hanging it" \
    "preconditions=$started27 reader exit=$reader_rc (124 = still open after 25s)"
fi
cleanup_repo "$REPO"

# --- Bounded drain, bounded teardown, and the terminator's position (#1621) ----------------------

# A variable assignment prefixed to a *function* call persists in the calling shell in bash's
# default (non-POSIX) mode, so every knob these three cases introduce is unset again afterwards.
# The pre-existing cases get away without it because the ones that follow them pin an exit code a
# stale `FAKE_*` cannot forge; these knobs leak processes and multi-second waits instead.

# Test 28: a leaked process holding this script's stdout must not hang `cleanup` (#1607 finding B).
# The log writer sees EOF only when *every* holder of its pipe closes it, and this script's stdout
# is inherited by `npx playwright test` — so a leaked browser keeps it open and an unbounded drain
# blocks forever inside the one handler whose job is to guarantee teardown and the terminator,
# turning a visible failure into an invisible hang.
#
# Which assertion forces what, because they are not interchangeable:
#   - `log writer did not drain` is red on a script with no drain at all, and green once the drain
#     exists and is bounded.
#   - the elapsed-time bound is what a drain with the watchdog *removed* fails: it does not return.
#   - `leak_alive` is the anti-vacuity guard. If the fixture's leak had already exited, no holder
#     would remain, the writer would drain instantly, and this case would pass having tested nothing.
REPO="$(make_repo)"
start=$SECONDS
FAKE_PW_LEAK_STDOUT=1 DRAIN_TIMEOUT_SECONDS=3 \
  run_suite --base-url http://127.0.0.1:9999 && rc=0 || rc=$?
elapsed=$((SECONDS - start))
leak_pid="$(cat "$REPO/state/leaked-pid" 2>/dev/null || true)"
leak_alive=no
[ -n "$leak_pid" ] && kill -0 "$leak_pid" 2>/dev/null && leak_alive=yes
if [ "$leak_alive" = yes ] && [ "$elapsed" -lt 40 ] &&
  log_has "log writer did not drain" &&
  terminator_is_last; then
  assert_pass "a leaked stdout holder: drain is bounded, terminator still last"
else
  assert_fail "a leaked stdout holder: drain is bounded, terminator still last" \
    "leak_alive=$leak_alive elapsed=${elapsed}s exit=$rc warned=$(log_has 'log writer did not drain' && echo yes || echo no) last='$(tail -1 "$REPO/checklist-suite.log" 2>/dev/null)'"
fi
cleanup_repo "$REPO"
unset FAKE_PW_LEAK_STDOUT DRAIN_TIMEOUT_SECONDS

# Test 29: a hung teardown is bounded, and the bound is escapable only by SIGKILL (#1620, absorbed).
# `cleanup` masks INT/TERM/HUP for its whole length, which is what stops a signal abandoning the
# teardown midway — and left unbounded that same mask means a hung Supabase can only be escaped
# with SIGKILL, which is the one path that leaves the server behind.
#
# Two mutants die here, and the second is the reason `-s KILL` is not decoration. Dropping the
# `timeout` makes the run take FAKE_TEARDOWN_SLEEP seconds. Dropping `-s KILL` does the same, but
# only because the script re-installs `trap '' INT TERM HUP` inside the timeout's child: `timeout`
# catches those signals before it forks, and a *caught* disposition resets to SIG_DFL across
# `exec`, so without that re-install the bound would silently un-mask the whole teardown call and
# tests 24 and 25 would be the ones to go red.
REPO="$(make_repo)"
start=$SECONDS
FAKE_TEARDOWN_SLEEP=30 TEARDOWN_TIMEOUT_SECONDS=2 \
  run_suite --base-url http://127.0.0.1:9999 && rc=0 || rc=$?
elapsed=$((SECONDS - start))
if [ "$elapsed" -lt 20 ] &&
  [ -e "$REPO/teardown-started" ] && [ ! -e "$REPO/teardown-called.log" ] &&
  log_has "teardown did not finish within" &&
  log_has "teardown-test-barn.sh" &&
  log_has "--prefix e2e-" &&
  terminator_is_last; then
  assert_pass "a hung teardown is killed at the bound, recovery command re-emitted, terminator last"
else
  assert_fail "a hung teardown is killed at the bound, recovery command re-emitted, terminator last" \
    "elapsed=${elapsed}s exit=$rc started=$([ -e "$REPO/teardown-started" ] && echo yes || echo no) completed=$([ -e "$REPO/teardown-called.log" ] && echo yes || echo no) warned=$(log_has 'teardown did not finish within' && echo yes || echo no)"
fi
cleanup_repo "$REPO"
unset FAKE_TEARDOWN_SLEEP TEARDOWN_TIMEOUT_SECONDS

# Test 30: **the ordering property, with a forcing function.** #1607's test 26 asserted the same
# thing and could not be made to fail — nothing synchronised the append, so on a fast host it
# passed with or without the fix. This one removes the timing question entirely.
#
# The console side of the writer is a fifo this file holds open and never reads, so `grep` fills
# its pipe and blocks, `tee` fills its pipe to `grep` and blocks, and the teardown stub's 1 MB
# fills the fifo feeding the writer. At the moment `cleanup` would append the terminator there is
# therefore a **guaranteed** backlog sitting unread — not a probable one. Then:
#   - with the drain: the writer was killed at the bound, so unblocking the console changes
#     nothing and the terminator is still the last line (of a log that is honestly truncated,
#     which the WARNING above it says).
#   - without it: the writer is merely blocked, so the terminator looks last *until* the console
#     is drained, at which point the backlog lands after it. That is why this case asserts after
#     unblocking rather than before, and why it fails deterministically rather than usually.
# Measured while designing #1621: 40 956-byte log ending in the terminator, versus a 101 050-byte
# log with the terminator ~40 KB from the end.
# Launched through `start_suite` rather than in the foreground, for the same reason every signal
# case is: a run whose console is blocked and whose script is broken never returns, and a
# foreground launch would hang this gate instead of failing the case. The recorded pgid also lets
# `cleanup_repo` kill the whole run — verified necessary the hard way, when an interrupted round of
# this case left the script, its `tee`, its `grep` and the teardown stub all blocked on the fifo.
REPO="$(make_repo)"
mkfifo "$REPO/console"
# Read-write so opening never blocks and the pipe always has a holder; deliberately never read from
# until the assertions below say so.
exec 9<> "$REPO/console"
SIGNAL_OK=true
started30=true
SUITE_STDOUT="$REPO/console" FAKE_TEARDOWN_NOISE=1000000 \
TEARDOWN_TIMEOUT_SECONDS=3 DRAIN_TIMEOUT_SECONDS=3 \
  start_suite --base-url http://127.0.0.1:9999 || started30=false
if [ "$started30" = true ]; then
  await_log "run-checklist-suite.sh exited" 600 || started30=false
fi
last_while_blocked=$(terminator_is_last && echo yes || echo no)
# Unblock the console and give whatever the writer still held every chance to land.
timeout 5 cat <&9 > /dev/null
sleep 1
last_after_unblock=$(terminator_is_last && echo yes || echo no)
exec 9>&-
if [ "$started30" = true ] &&
  log_has "log writer did not drain" &&
  [ "$last_after_unblock" = yes ]; then
  assert_pass "a backlogged writer cannot land output after the terminator"
else
  assert_fail "a backlogged writer cannot land output after the terminator" \
    "reached_terminator=$started30 blocked=$last_while_blocked after=$last_after_unblock size=$(wc -c < "$REPO/checklist-suite.log" 2>/dev/null) last='$(tail -c 60 "$REPO/checklist-suite.log" 2>/dev/null | tail -1)'"
fi
cleanup_repo "$REPO"
unset SUITE_STDOUT FAKE_TEARDOWN_NOISE TEARDOWN_TIMEOUT_SECONDS DRAIN_TIMEOUT_SECONDS

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
