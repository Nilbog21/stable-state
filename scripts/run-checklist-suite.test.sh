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
# would put ~8 test-only variables into a 535-line script every e2e run goes through, each one a
# fresh way to run it wrong, and they still could not intercept `curl` or `ss`.
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

  # Records its argv rather than doing anything. The marker's *existence* is what "teardown ran"
  # means in the signal cases below, which is the property #1601's review reproduced by hand.
  cat > "$dir/scripts/teardown-test-barn.sh" <<'EOF'
#!/usr/bin/env bash
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
    setTimeout(() => process.exit(0), grace * 1000);
  });
}
' "$port"
EOF

  chmod +x "$dir/shim/npx" "$dir/shim/fake-next-start"
  echo "$dir"
}

# Kills only what this fixture started, by the pid the fixture itself recorded. Never a pattern
# match on a process name: every worktree on this host runs scripts with these names.
kill_repo_server() {
  local pid
  pid="$(cat "$1/state/server-pid" 2>/dev/null || true)"
  if [ -n "$pid" ]; then
    kill -9 "$pid" 2>/dev/null || true
  fi
}

cleanup_repo() {
  kill_repo_server "$1"
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
SUITE_PID=
start_suite() {
  PATH="$REPO/shim:$PATH" \
  FAKE_STATE="$REPO/state" \
  FAKE_BIN="$REPO/shim" \
  E2E_SLOT_DIR="$REPO/slots" \
    setsid bash -c '
      cd "$1" || exit 1
      echo $$ > "$1/state/suite-pid"
      shift
      exec bash scripts/run-checklist-suite.sh "$@"
    ' _ "$REPO" "$@" >/dev/null 2>&1 < /dev/null &
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

# Test 18: the default path builds, starts, runs, and leaves no server behind. The port check is
# the script's own contract ("a run leaves no server behind") asserted from outside it.
REPO="$(make_repo)"
run_suite && rc=0 || rc=$?
port="$(head -1 "$REPO/state/server-ports" 2>/dev/null || true)"
held="$(ss -lntH "sport = :${port:-0}" 2>/dev/null)"
if [ "$rc" -eq 0 ] && [ -n "$port" ] && [ -z "$held" ] && [ -e "$REPO/teardown-called.log" ]; then
  assert_pass "default run: builds, serves, tears down, releases the port"
else
  assert_fail "default run: builds, serves, tears down, releases the port" "exit=$rc port=$port held=$held"
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

# Measured on bash 5.3.9 while writing these, and the reason they are written as **group** signals:
#
#   - `kill -TERM <script-pid>` delivered while the EXIT trap is running does NOT abandon the
#     handler. The trap completes and bash re-raises afterwards.
#   - `kill -TERM -<pgid>` DOES abandon it, because it also kills the `sleep` the trap is sitting
#     in. That is what a terminal Ctrl-C's own process group, a `kill -- -PGID`, and a CI wrapper's
#     escalation all deliver — so it is the shape that occurs, and the shape #1601's review hit.
#   - The fix works because an *ignored* disposition is inherited across `exec`: `trap '' TERM`
#     protects the trap's own `sleep` child as well as the shell.
#
# Each case waits for the log line that says the escalation has begun, rather than sleeping a fixed
# amount — a slow machine then delays the test instead of turning it into a coin flip.

# Test 21: INT, then TERM mid-escalation. Three assertions, all three of them the reproduction:
# the server process group is gone, teardown RAN, and the terminator reached the log.
REPO="$(make_repo)"
FAKE_PW_SLEEP=30 FAKE_SERVER_TERM_GRACE=4 start_suite
await_file "$REPO/state/playwright-started" 600
kill -INT -"$SUITE_PID" 2>/dev/null
await_log "Stopping this run's production server" 300
sleep 1
kill -TERM -"$SUITE_PID" 2>/dev/null
await_log "run-checklist-suite.sh exited" 400
server_pid="$(cat "$REPO/state/server-pid" 2>/dev/null || true)"
if ! kill -0 "${server_pid:-0}" 2>/dev/null &&
  [ -e "$REPO/teardown-called.log" ] &&
  log_has "run-checklist-suite.sh exited"; then
  assert_pass "INT then TERM mid-escalation: server gone, teardown ran, terminator written"
else
  assert_fail "INT then TERM mid-escalation: server gone, teardown ran, terminator written" \
    "server_pid=$server_pid teardown=$([ -e "$REPO/teardown-called.log" ] && echo yes || echo no)"
fi
cleanup_repo "$REPO"

# Test 22: the same for HUP. Not decoration — HUP is what a closed terminal or a dropped ssh
# session delivers, and it has the identical default disposition.
REPO="$(make_repo)"
FAKE_PW_SLEEP=30 FAKE_SERVER_TERM_GRACE=4 start_suite
await_file "$REPO/state/playwright-started" 600
kill -INT -"$SUITE_PID" 2>/dev/null
await_log "Stopping this run's production server" 300
sleep 1
kill -HUP -"$SUITE_PID" 2>/dev/null
await_log "run-checklist-suite.sh exited" 400
server_pid="$(cat "$REPO/state/server-pid" 2>/dev/null || true)"
if ! kill -0 "${server_pid:-0}" 2>/dev/null &&
  [ -e "$REPO/teardown-called.log" ] &&
  log_has "run-checklist-suite.sh exited"; then
  assert_pass "INT then HUP mid-escalation: server gone, teardown ran, terminator written"
else
  assert_fail "INT then HUP mid-escalation: server gone, teardown ran, terminator written" \
    "server_pid=$server_pid teardown=$([ -e "$REPO/teardown-called.log" ] && echo yes || echo no)"
fi
cleanup_repo "$REPO"

# Test 23: a bare TERM with no INT first — the *false green* half, and the more dangerous one.
# With no TERM trap the EXIT handler runs with `$?` still 0, so the terminator says `exited 0` for
# a run that was killed, and #1602's merge gate reads that as a passing suite. `trap 'exit 143'` is
# what makes the status honest.
REPO="$(make_repo)"
FAKE_PW_SLEEP=30 start_suite
await_file "$REPO/state/playwright-started" 600
kill -TERM -"$SUITE_PID" 2>/dev/null
await_log "run-checklist-suite.sh exited" 400
if log_has "run-checklist-suite.sh exited 143" && [ -e "$REPO/teardown-called.log" ]; then
  assert_pass "bare TERM: the terminator reports 143 rather than a false 0"
else
  assert_fail "bare TERM: the terminator reports 143 rather than a false 0" \
    "terminator=$(grep -o 'run-checklist-suite.sh exited [0-9]*' "$REPO/checklist-suite.log" 2>/dev/null | tail -1)"
fi
cleanup_repo "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
