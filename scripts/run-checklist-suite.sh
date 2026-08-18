#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Every barn this run creates is slugged "$RUN_PREFIX-<spec key>-<playwright project>" (see
# e2e/support/test.ts), so the exit trap can tear down exactly this run's barns and a concurrent
# run in another worktree is unaffected.
RUN_PREFIX="e2e-$(date +%s)-$RANDOM"
# `git rev-parse --show-toplevel` resolves to *this* worktree's root, so the path is
# per-worktree isolated for free. Not under test-results/ — Playwright wipes that directory
# at the start of every run, which would leave tee writing to a deleted inode.
LOG_PATH="$PWD/checklist-suite.log"

# Truncated with `>` before anything else runs, so a log left behind by a dead run can never
# be mistaken for this one's; the header says which barns and when.
echo "=== run-checklist-suite.sh — barn prefix $RUN_PREFIX — started $(date) ===" > "$LOG_PATH"
# Pre-scanned rather than read off the arg loop below, because that loop runs after the
# redirect this decides. `--interactive` implies it: a headed run is a human watching.
# Looped per argument rather than matched against `" $* "`, which joins argv into one string
# and so can't tell a `--verbose` flag from a flag *value* containing that substring.
VERBOSE=false
for arg in "$@"; do
  case "$arg" in --verbose|--interactive) VERBOSE=true ;; esac
done

# The console, saved before the redirect below so `cleanup` can put its own output back on it once
# it has finished with the log writer. #1607 left a comment claiming a saved fd 3 that was never
# actually here — it went out with the drain machinery the comment outlived; #1621 needs it for
# real. Every long-lived child this script starts closes it again (`3>&-`), because a descriptor
# onto the caller's stdout is a descriptor that can hang the caller.
exec 3>&1

# Send this script's stdout and stderr — and that of everything it runs — through `tee`, so
# the log gets the whole run, including the early bails that kill it under `set -e` before
# Playwright writes a line. Either branch costs the `list` reporter its live in-place progress
# (stdout is no longer a TTY); the log keeps one static line per test, which is the better
# trade for a file read afterwards. What reaches *stdout* differs — see the branches.
#
# **The writer is a background job fed through a private fifo, not the `>(…)` process substitution
# this replaces, and that is #1621's central move.** `cleanup` has to drain the writer before it
# appends the terminator, or the append races output still in flight (#1607 shipped that race
# knowingly). A drain needs the writer's pid, and `$!` names a process substitution only from bash
# 5.0 — on 4.x, which is all this repo's scripts assume, `LOG_WRITER_PID=$!` is fatal under `set -u`
# *before* `trap cleanup EXIT` is installed, so no terminator is written at all. That was #1607's
# finding C, and a plain background job dissolves it: `$!` is set on every bash in scope, so the
# stated floor does not have to move to buy the guarantee.
#
# `exec tee` inside the subshell means the recorded pid **is** `tee`'s — the one process that writes
# to $LOG_PATH, which is the only process the ordering guarantee is about. #1607's finding A had to
# talk about killing "the whole writer pipeline" because it killed the process-substitution subshell
# and left `tee`, its child, alive holding the log open in append mode. Naming `tee` directly is
# what retires that. The console-side `grep` is deliberately *outside* the drained unit: it writes
# to fd 3 and never to the log, so it cannot violate the ordering and needs neither drain nor kill.
#
# Both branches fence the writer against TERM and HUP (#1607), so an interrupted run keeps the tail
# of its log rather than losing everything from the signal onward. The writer runs in this script's
# own process group either way — deliberately, since a group SIGKILL is what closes the caller's
# stdout when the `EXIT` trap cannot run at all — so without this a group-delivered TERM or HUP
# kills it mid-run. INT is absent because bash already ignores it here and the trap cannot change
# that: measured on this host, `/proc/<pid>/status` `SigIgn` is `0x6` (INT+QUIT) for a process
# substitution's child *and* for a background job, from bash's own rule for asynchronous commands.
#
# **None of this is load-bearing for the exit-code terminator**, and it must not become so. Whether
# a writer survives a given signal turns out to be environment-dependent — a group INT leaves it
# alone on one host and kills it on GitHub Actions — so `cleanup` writes that line straight to
# $LOG_PATH, and this fence only affects how much of the *rest* of the log survives.
WRITER_FIFO_DIR="$(mktemp -d)"
mkfifo "$WRITER_FIFO_DIR/stream"
if [ "$VERBOSE" = true ]; then
  ( trap '' TERM HUP; exec tee -a "$LOG_PATH" >&3 ) < "$WRITER_FIFO_DIR/stream" &
else
  # The log still gets the whole run; stdout drops only the reporter's per-test ✓/- lines,
  # which is ~190 of a 191-test run's 209 and is re-paid as cache-read input on every later
  # turn of the invoking session. Everything else passes through — this script's own echoes
  # (so early bails are untouched), `Running N tests`, ✘ lines, the failure detail blocks,
  # the pass/fail summary counts, and teardown. Not the exit terminator: #1607 routed that
  # around this filter entirely, straight to the log file. A stream filter rather
  # than a reporter swap because the log has to keep full `list` output either way.
  # `--line-buffered` because grep block-buffers to a non-TTY, which would stall the stream.
  ( trap '' TERM HUP; exec tee -a "$LOG_PATH" ) < "$WRITER_FIFO_DIR/stream" \
    > >(exec grep --line-buffered -vE '^  (✓|-) +[0-9]+ ' >&3) &
fi
LOG_WRITER_PID=$!
# Blocks until the writer has opened the read end, which is what makes the `rm` below safe: by the
# time this returns both ends are open and the fifo's name is no longer needed by anyone.
exec > "$WRITER_FIFO_DIR/stream" 2>&1
rm -rf "$WRITER_FIFO_DIR"

echo "Logging to $LOG_PATH"

usage() {
  cat >&2 <<'EOF'
Usage: run-checklist-suite.sh [--interactive] [--base-url <origin>] [--spec <path>] [--allow-prod] [--hold-open] [--verbose]

By default this script is self-contained: it runs `next build`, starts its own `next start` on a
free ephemeral port, points Playwright at it, and stops it on exit. It never touches your `next dev`.

  --interactive     Headed run including @visual specs (default: headless, @visual excluded); implies --verbose
  --base-url URL    Target this existing server instead — skips the build and start entirely.
                    For an already-running dev server, or a deployment with --allow-prod.
  --spec PATH       Playwright spec path or glob; repeatable (default: full suite)
  --allow-prod      Target a non-dev Supabase project; requires --base-url
  --hold-open       Prompt before teardown, so the seeded barns survive manual checklist steps
  --verbose         Stream the reporter's per-test lines to stdout too (default: log only)
EOF
}

MODE=auto
BASE_URL=""
ALLOW_PROD=false
HOLD_OPEN=false
SPEC_ARGS=()
PROD_FLAG=()
# Flipped just before Playwright starts, so an early bail (bad flag, missing .env.local,
# unreadable Supabase vars, the schema preflight's abort) doesn't call teardown before any
# barn could exist.
SEEDED=false
# This script's own process group, captured once so `stop_server` can refuse to signal it (#1621).
# `|| true` and a possibly-empty value, because a `ps` that cannot answer must not be the reason a
# run cannot start; the guard that reads it treats empty as "cannot compare" and proceeds as before.
SCRIPT_PGID="$(ps -o pgid= -p $$ 2>/dev/null | tr -d ' ')" || true
# Set only once this run has started a server of its own. Empty on every path that hasn't —
# an early bail, and every --base-url run, which by definition targets a server it did not
# launch and must never kill.
SERVER_PGID=""
SERVER_PORT=""
BUILD_LOG="$PWD/checklist-build.log"
SERVER_LOG="$PWD/checklist-server.log"

# Written as a loop over a captured value rather than `ss … | grep -q`, which is scripts/CLAUDE.md's
# pipefail race. Non-zero if the port is still held when the budget runs out, so the caller can
# escalate instead of assuming the port is free.
wait_for_port_release() {
  local port="$1" secs="$2" i
  for ((i = 0; i < secs; i++)); do
    [ -z "$(ss -lntH "sport = :$port")" ] && return 0
    sleep 1
  done
  [ -z "$(ss -lntH "sport = :$port")" ]
}

# Stops the server this run started, if it started one. `cleanup` is its only caller: start_server's
# retry path deliberately kills inline instead, because it must not wait on a port that by then is
# held by whoever won the race. Clearing SERVER_PGID still leaves this idempotent.
stop_server() {
  if [ -z "$SERVER_PGID" ]; then
    return 0
  fi
  # Refuse to signal our **own** process group, whatever else happens. `SERVER_PGID` is read back
  # with `ps -o pgid=` from the pid of a `setsid`'d child, and every way that read can go wrong
  # returns this script's own group instead of the server's — `setsid` forking rather than
  # `exec`ing (it does that when its caller is already a group leader) leaves `$!` naming the
  # short-lived parent, which is still in our group. `kill -- -<our own pgid>` then does not stop a
  # server, it SIGTERMs this script, its harness, and on CI the whole `ci.sh` job: the failure
  # reads as `Process completed with exit code 143` with nothing pointing at the cause, which is
  # exactly how it was found. Leaking a server is the lesser harm and is loud; killing the job that
  # is running you is neither recoverable nor attributable.
  if [ -n "$SCRIPT_PGID" ] && [ "$SERVER_PGID" = "$SCRIPT_PGID" ]; then
    echo "WARNING: refusing to stop the server — its pgid ($SERVER_PGID) is this script's own process group." >&2
    echo "  That means the pgid lookup did not see a detached server. Kill it by port instead: fuser -k $SERVER_PORT/tcp" >&2
    SERVER_PGID=""
    return 0
  fi
  echo "Stopping this run's production server on port $SERVER_PORT (pgid $SERVER_PGID, this script's pgid $SCRIPT_PGID)."
  # The interrupt fence this sequence needs lives in `cleanup`, which is this function's only
  # caller — see the comment there for why it is installed one level up rather than here. #1569
  # added the original `trap '' INT` at *this* level, in a post-review fixup (445c150a, "fence the
  # interrupt"), because a signal landing mid-escalation abandons the sequence before the "still
  # held" diagnostic can print; #1607 kept that intent and widened both the signal set and the
  # region it covers.
  # The whole process group: `next start` spawns a next-server child that is what actually holds
  # the port, so killing the leader alone orphans it — the same lesson #1155/#1569 learned about
  # the dev server. `|| true` because a server that has already died is a branch, not a failure.
  kill -- "-$SERVER_PGID" 2>/dev/null || true
  # 15s, inherited from #1569 rather than re-chosen. This server has just served the entire suite,
  # so if anything it has more to drain than the freshly-relaunched `next dev` that number was set
  # for — and nothing here measured a shorter one, which is the only thing that would justify one.
  if ! wait_for_port_release "$SERVER_PORT" 15; then
    echo "Port $SERVER_PORT still held 15s after SIGTERM — escalating to SIGKILL."
    kill -9 -- "-$SERVER_PGID" 2>/dev/null || true
    if ! wait_for_port_release "$SERVER_PORT" 5; then
      # Loud rather than silent: this script's contract is that a run leaves no server behind,
      # and this is the one path where it couldn't keep it.
      echo "WARNING: port $SERVER_PORT is still held after SIGKILL. Holder: $(ss -lptnH "sport = :$SERVER_PORT")" >&2
    fi
  fi
  SERVER_PGID=""
}

cleanup() {
  # Captured first: teardown-test-barn.sh's own status would otherwise replace the status
  # the script is actually exiting with.
  local code=$?
  local teardown_code=0 teardown_warning="" drain_watchdog="" drain_status=0
  # The whole handler is uninterruptible, and the extent is the point (#1607). A group-delivered
  # INT/TERM/HUP abandons a running trap where it stands — it kills the `sleep` or the child the
  # handler is sitting in — and every one of this handler's three jobs is a place where that
  # destroys state rather than merely abandoning it: the server group survives, the barns leak, and
  # the exit-code terminator #1602's merge gate waits on is never written. Group delivery is the
  # shape that actually occurs (a terminal's Ctrl-C, a `kill -- -PGID`, a CI wrapper's own timeout
  # escalation), and a *second* Ctrl-C from an impatient developer is the most ordinary trigger
  # there is.
  #
  # It sits here rather than inside `stop_server`, where #1569 put the narrower `trap '' INT`, for
  # two measured reasons. The escalation was never the only vulnerable region — `teardown-test-barn.sh`
  # is a multi-second network call and the terminator write follows it, both outside any fence
  # `stop_server` could install. And `stop_server` returns at its `[ -z "$SERVER_PGID" ]` guard
  # before installing anything at all, which is *every* `--base-url` run and every path where
  # `start_server` gave up — so a fence living there is absent from exactly the runs `--allow-prod`
  # requires and `/testIssue` uses, where one signal then suffices.
  #
  # An *ignored* disposition is what makes this work: it is inherited across `exec`, so it covers
  # `teardown-test-barn.sh` and the `sleep`s as well as this shell. A `trap 'handler'` would not —
  # a caught disposition resets to default in the child. Nothing restores the previous traps
  # afterwards, because there is no afterwards: this handler ends in `exit`.
  trap '' INT TERM HUP PIPE
  # PIPE is in that list, and `set +e` is here, for the same reason: if the log writer has already
  # died, every diagnostic write below is a write to a broken pipe. Under the script's `set -e` a
  # SIGPIPE or an EPIPE from a plain `echo` would abort this handler before the barns are torn down
  # — which is the failure this whole fence exists to prevent, arriving through the one door the
  # signal mask does not cover. A cleanup handler must not die of a failed diagnostic write.
  set +e
  # Before the barn teardown, so the server's memory is released first, and unconditional so every
  # exit path leaves no server behind — a bad flag, a failed build, a Ctrl-C, or a green run.
  stop_server
  if [ "$SEEDED" = true ]; then
    # --prefix, not --all: --all would delete a concurrent run's barns too.
    #
    # **Bounded (#1620, absorbed into #1621).** The mask above is what stops a signal abandoning
    # this call midway, and left unbounded it also means a hung or slow Supabase can be escaped
    # only with SIGKILL — the one path that leaves the server behind. The old behaviour was
    # interruptible-but-unreliable and #1607's was reliable-but-unbounded; this is both. The budget
    # is deliberately not the product of a measurement campaign: a healthy run's teardown is one
    # SELECT returning zero rows, truncation is loud (the recovery command is re-emitted below and
    # `teardownBarn` deletes the `barns` row last, so an interrupted sweep is recoverable), and the
    # number only has to beat infinity.
    #
    # Two things are true here at once and **each explains the other**:
    #
    #   - `timeout` catches INT/QUIT/HUP/TERM before it forks, and a *caught* disposition resets to
    #     SIG_DFL across `exec` — only an *ignored* one is inherited. Measured on this host:
    #     `/proc/<child>/status` `SigIgn` goes `0x8007` -> `0` across `timeout`. So a bare
    #     `timeout … bash scripts/teardown-test-barn.sh` silently stops the mask above from covering
    #     this call at all. The mask is therefore re-installed *inside*, where `exec` carries it into
    #     the real script. (Measured too: dropping the re-install does **not** break the harness's
    #     two second-signal cases, because `timeout` also puts its child in its own process group, so
    #     the group signal those cases send no longer reaches the teardown either way. The exposure
    #     is real but latent — which is why the harness grew a case that signals the teardown's *own*
    #     group rather than the run's.)
    #   - and once it is re-installed, a default TERM from `timeout` really would be the no-op that
    #     reads as working. So `-s KILL` is not tidiness: it is the only signal that can end this
    #     call. (#1620's body gave the inheritance itself as the reason for `-s KILL`; that is not
    #     what the measurement says, and the re-install is what makes the conclusion true.)
    teardown_code=0
    timeout -s KILL "${TEARDOWN_TIMEOUT_SECONDS:-600}" \
      bash -c 'trap "" INT TERM HUP; exec bash scripts/teardown-test-barn.sh "$@"' \
      run-checklist-suite-teardown "${PROD_FLAG[@]}" --prefix "$RUN_PREFIX" || teardown_code=$?
    # 124 is the documented expiry status; GNU coreutils reports 128+9 when it was `-s KILL` that
    # ended the call, and the uutils build on this host reports 124 for both. Accept either rather
    # than pick a coreutils — the run has to read the same on a developer box and on CI.
    if [ "$teardown_code" -eq 124 ] || [ "$teardown_code" -eq 137 ]; then
      # Held rather than printed, and emitted below the drain straight into $LOG_PATH. Printing it
      # here would send it through the log writer, and the ordering test found what that costs: if
      # whoever is reading this script's stdout has stopped, the writer blocks, the pipe feeding it
      # fills, and a diagnostic `echo` in this handler blocks **indefinitely** — in the one handler
      # that must finish. #1607 already had to stop this handler *dying* of a failed diagnostic
      # write (hence PIPE in the mask and `set +e`); this is the same lesson with the other verb.
      # A regular-file append can do neither, and emitting it after the drain also keeps it in
      # order with the rest of the log rather than racing output still in flight.
      teardown_warning="$(printf 'WARNING: barn teardown did not finish within %ss and was killed.\n  These barns may still exist. Tear them down with: bash scripts/teardown-test-barn.sh %s --prefix %s\n' \
        "${TEARDOWN_TIMEOUT_SECONDS:-600}" "${PROD_FLAG[*]}" "$RUN_PREFIX")"
    fi
    # Unchanged from #1607: teardown's status replaces the run's own. That the run's exit code can be
    # overwritten this way is pre-existing and deliberately out of scope here (#1620's own note).
    if [ "$teardown_code" -ne 0 ]; then
      code=$teardown_code
    fi
  fi
  # --- Drain the log writer, then write the terminator. -------------------------------------------
  #
  # Everything above this line went through the writer; the terminator does not, because routing it
  # through made its delivery depend on the writer surviving the signal that killed the run, and
  # whether it does is environment-dependent (a group INT leaves the writer alone on this project's
  # dev hosts and kills it on GitHub Actions, where the terminator then went missing on exactly the
  # INT paths). A direct append cannot be lost that way. What #1607 could not then promise was
  # **position**: the append raced output still in flight, so the terminator was usually but not
  # always the last line, while `/testIssue` Step 4 and `/overnightRefactor` both describe the log as
  # ending with it. #1621 makes that description true, and the ordering is bought by `wait` returning
  # rather than by any assumption about timing.
  #
  # Put this shell's own output back on the console first, which drops our reference to the writer's
  # fifo. After that the only holders left are leaked descendants of the run — and there can be some:
  # this script's stdout is inherited by `npx playwright test`, so a leaked browser keeps the pipe
  # open, the writer never sees EOF, and an unbounded `wait` would block forever inside the one
  # handler whose whole job is to guarantee teardown and the terminator. That is why the bound is
  # mandatory rather than defensive (#1607 finding B), and why a watchdog and not just a `wait`.
  exec 1>&3 2>&3
  ( sleep "${DRAIN_TIMEOUT_SECONDS:-10}"; kill -9 "$LOG_WRITER_PID" 2>/dev/null ) &
  drain_watchdog=$!
  # `wait` rather than polling `kill -0`, and the difference is the guarantee. `wait` returns only
  # once the writer has been **reaped**, so when it returns `tee` cannot issue another write — not
  # even one it was already inside when the watchdog fired, which is the window a liveness poll
  # would leave open. A `kill -0` loop also cannot tell a live writer from an unreaped zombie.
  wait "$LOG_WRITER_PID" 2>/dev/null
  drain_status=$?
  # `kill -9`, and the -9 is the whole point. The watchdog is a child of *this* handler, so it
  # inherited the `trap '' INT TERM HUP` installed at the top — an ignored disposition, which a
  # subshell inherits. A plain `kill` is therefore a silent no-op on it, and the `wait` below then
  # blocks for the remainder of its `sleep`, adding the full DRAIN_TIMEOUT_SECONDS to **every**
  # run: measured at 10.0s per case across the whole harness, ~30ms before this drain existed, and
  # it is what pushed CI's `ci` job into a SIGTERM. The drain itself was never slow — `wait` on the
  # writer returns the moment it is reaped. This is the same lesson as the teardown call one screen
  # up: the mask reaches further than the thing it was installed for, and every child inside this
  # handler has to be looked at in that light.
  #
  # Safe against pid reuse without a check: the watchdog is our own child either way — still
  # sleeping, or a zombie this shell has not reaped — so the pid cannot yet belong to anyone else.
  kill -9 "$drain_watchdog" 2>/dev/null
  wait "$drain_watchdog" 2>/dev/null
  # Everything from here on is appended straight to $LOG_PATH and never echoed to the console: the
  # writer is gone, and a console write is the one thing left that could block or fail (see the
  # teardown warning above). The log is this handler's contract; the console is not.
  if [ -n "$teardown_warning" ]; then
    printf '%s' "$teardown_warning" >> "$LOG_PATH"
  fi
  if [ "$drain_status" -eq 137 ]; then
    # The watchdog fired: something still holds the pipe, so the log is missing whatever the writer
    # had not yet relayed. Said out loud, immediately above the terminator, because a truncated log
    # that admits it is strictly better than the hang this replaces — and this is the only place
    # this handler destroys information, on a path that was previously unbounded.
    printf 'WARNING: the log writer did not drain within %ss and was killed; this log is missing its tail.\n' \
      "${DRAIN_TIMEOUT_SECONDS:-10}" >> "$LOG_PATH"
  fi
  # Positionally last on every path that reaches here, which is every path where the `EXIT` trap
  # runs at all. The limits — a SIGKILLed run has no terminator, and the drain-timeout path above
  # truncates — are stated where this line is consumed: `/testIssue` Step 4, `/overnightRefactor`,
  # and docs/scripts/suite.md.
  printf '=== run-checklist-suite.sh exited %s — full log: %s ===\n' "$code" "$LOG_PATH" >> "$LOG_PATH"
  exit "$code"
}
# Installed before the .env.local/env-var checks below so those early bails get the same
# exit-code terminator in the log as a completed run.
trap cleanup EXIT
# Bash already runs an EXIT trap when the shell dies of SIGINT, so teardown would survive
# Ctrl-C without this. It's here to make that a property of the script rather than of bash's
# default signal handling, and to pin the exit status at 130 — the seeded barn outliving a
# Ctrl-C is exactly the leak this script exists to prevent.
trap 'exit 130' INT
# TERM and HUP get the same treatment (#1607), and for the same reason the INT trap above gives:
# to pin the exit status rather than leave it to bash. What the note above leaves implicit is the
# consequence, which for these two was live. Bash runs the EXIT trap for a default-disposition
# signal too, so teardown was not skipped — but it runs it with `$?` still **0**, and the trap
# then writes `=== … exited 0 ===` for a run that was killed. `/testIssue` Step 4 and #1602's
# merge gate both parse that line, so the missing traps did not merely lose a terminator, they
# forged a passing one. INT never had that failure only because it already had its trap.
#
# These pin the status; `cleanup`'s own mask is what keeps the handler alive long enough to write
# it. See the comment there.
trap 'exit 143' TERM
trap 'exit 129' HUP

while [ $# -gt 0 ]; do
  case "$1" in
    --interactive)
      MODE=interactive
      shift
      ;;
    --base-url)
      # A flag-shaped value means the origin was omitted, not that it's named "--hold-open" —
      # silently absorbing the next flag would drop it and run against a bogus origin.
      case "${2:-}" in
        ""|--*)
          echo "Error: --base-url requires an origin (e.g. http://localhost:3001)" >&2
          usage
          exit 1
          ;;
      esac
      BASE_URL="$2"
      shift 2
      ;;
    --spec)
      case "${2:-}" in
        ""|--*)
          echo "Error: --spec requires a spec path or glob" >&2
          usage
          exit 1
          ;;
      esac
      SPEC_ARGS+=("$2")
      shift 2
      ;;
    --allow-prod)
      ALLOW_PROD=true
      shift
      ;;
    --hold-open)
      HOLD_OPEN=true
      shift
      ;;
    --verbose)
      # Already applied by the pre-scan above; consumed here so it isn't an unknown arg.
      shift
      ;;
    *)
      echo "Error: unknown argument '$1'" >&2
      usage
      exit 1
      ;;
  esac
done

if [ ! -f ".env.local" ]; then
  echo "Error: .env.local not found. Copy .env.example to .env.local and fill in values." >&2
  exit 1
fi

parse_var() {
  grep -m1 "^$1=" .env.local | cut -d= -f2- | sed 's/[[:space:]]*#.*$//;s/^"//;s/"$//'
}

NEXT_PUBLIC_SUPABASE_URL="$(parse_var NEXT_PUBLIC_SUPABASE_URL || true)"
NEXT_PUBLIC_SUPABASE_ANON_KEY="$(parse_var NEXT_PUBLIC_SUPABASE_ANON_KEY || true)"
# Seeding now happens inside the Playwright process (one barn per spec file per project), so the test
# process needs the service-role key the seed script used to hold on its own.
SUPABASE_SERVICE_ROLE_KEY="$(parse_var SUPABASE_SERVICE_ROLE_KEY || true)"
DEV_SUPABASE_URL="$(parse_var DEV_SUPABASE_URL || true)"
# Required rather than optional (#1424). The /demo reaper spec authenticates its POST to
# /api/cron/reset-demo with this, and the alternative — pass it through when present and
# test.skip() when absent — would leave two checklist lines reading `(e2e: …)` while their
# assertions silently never ran on a given run, which is the exact laundering
# scripts/check-e2e-tags.sh exists to prevent. Costs no CI: nothing in .github/workflows/ runs
# Playwright, so this is local-developer and fable-worktree setup only, one `openssl rand -hex 32`.
CRON_SECRET="$(parse_var CRON_SECRET || true)"

for var_name in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY CRON_SECRET; do
  if [ -z "${!var_name}" ]; then
    echo "Error: $var_name is not set in .env.local" >&2
    exit 1
  # A value still carrying `.env.example`'s `<…>` placeholder convention (#1619). Empty was
  # already the right sentinel for all four — the branch above rejects it — and the placeholder
  # was the one value that defeated it, arriving at a check that only ever asked whether
  # *something* was there. It matters most for CRON_SECRET: /api/cron/reset-demo compares it to
  # the request's Authorization header, so copy-through leaves the demo-reaper endpoint guarded
  # by a string published in this repo, and a developer pasting their own .env.local into the
  # Vercel dashboard carries that to prod.
  #
  # A **substring** match, not the anchored /^<.*>$/ that setup-demo-user.ts's resolver uses on
  # the same convention. Three of these four placeholders are whole-value and an anchored match
  # would catch them, but NEXT_PUBLIC_SUPABASE_URL's is embedded in a larger value
  # (`https://<your-project-ref>.supabase.co`), and that one is only reachable by a substring
  # match. Safe here because none of these four can legitimately contain an angle bracket — a
  # project URL, two JWTs, and a hex string — which is exactly what is not true of a user-chosen
  # password, hence the anchoring over there.
  #
  # This **halts**, where the resolver mints. Same convention, opposite response, and the
  # difference is that there is nothing here to mint: no value this script could invent would
  # authenticate against the running server, so continuing would only move the failure into a
  # spec's 401.
  #
  # The offending value is deliberately not echoed. These four are all secrets, and a false
  # positive would print a live one into a log the fleet reads.
  elif [[ "${!var_name}" == *"<"*">"* ]]; then
    echo "Error: $var_name is still the .env.example placeholder — replace it with a real value in .env.local" >&2
    exit 1
  fi
done

# Same meaning as in e2e-auth-users.sh/teardown-test-barn.sh/change-user.sh/seed-account.sh:
# it bypasses their assertDevProject check. This script has no dev-project check of its own —
# .env.local alone picks the Supabase project (those scripts re-read it and ignore any env
# override), so without this flag the teardown call and the suite's own in-process
# assertDevProject (e2e/support/test.ts) both stay fail-closed on non-dev.
if [ "$ALLOW_PROD" = true ]; then
  PROD_FLAG=(--allow-prod)
  # Without an origin this seeds the target project and then drives a server of its own — built
  # from this branch and reading that same target-pointed .env.local — running mutating specs
  # against it. #1601 changed which server that is (its own `next start`, not the developer's
  # `next dev` on :3000) and changed nothing about why the flag combination is refused.
  if [ -z "$BASE_URL" ]; then
    echo "Error: --allow-prod requires --base-url (otherwise the run seeds the target project but drives a server it builds itself, which reads that same .env.local)" >&2
    exit 1
  fi
  # Not fatal: the flag is simply redundant on dev. Worth saying, because if --base-url points
  # somewhere this project doesn't back, global-setup.ts mints cookies named for the wrong
  # project ref and every spec fails on auth with no hint as to why.
  if [ "$NEXT_PUBLIC_SUPABASE_URL" = "$DEV_SUPABASE_URL" ]; then
    echo "Note: --allow-prod is a no-op here — .env.local points at the dev project ($DEV_SUPABASE_URL)." >&2
  fi
fi

# Schema preflight (#1599). Every worktree shares one dev Supabase project, so a sibling
# branch's `npx supabase db push` applies its schema for *all* of them, and keeps it applied
# for as long as that branch's PR is open — whether or not the branch ever merges. A suite run
# against a DB whose schema is ahead of what this branch declares fails in every spec's
# beforeAll with nothing pointing at the cause: #1295's blocked mode=full run returned 76
# failed / 840 did not run, identically across three runs (two on a freshly reset DB), 74 of
# them one NOT NULL constraint the branch under test had never seen. Ten minutes per run to
# produce a wall of failures attributable to nothing in the diff.
#
# The pre-existing guards all miss it for one shared reason: each closes a window around a
# *push*, and none covers a push whose schema stays applied afterwards. The fix can't be merged
# down from base either, since base won't carry the pushing branch's migration until that PR
# merges. So the check has to be about the state of the DB, not about branch ancestry. Which
# guard covers which window is inventoried once, in docs/scripts/suite.md — not duplicated here,
# because a list kept in two places is the drift #1542 had to go back and fix.
#
# Placed here deliberately: after arg parsing (the --allow-prod skip below needs it) but before
# the e2e slot is acquired and before any barn is seeded, so an abort consumes neither.
if [ "$ALLOW_PROD" = true ]; then
  # `migration list` compares local files against the project the CLI is *linked* to
  # (supabase/.temp/project-ref), which is a different selection from the .env.local one every
  # other script here reads — that divergence is the whole reason assert-dev-project.sh checks
  # both, so this cannot claim to be checking the project an --allow-prod run actually drives.
  # Enforcing it anyway would abort a deliberate prod run over a dev DB that is legitimately
  # ahead mid-development.
  echo "Skipping the schema preflight: 'supabase migration list' can only compare against the project the CLI is linked to, which is not the project an --allow-prod run targets."
else
  echo "Checking the dev database's schema against this branch's migrations..."
  # Captured into a variable rather than piped, per scripts/CLAUDE.md's pipefail hazard.
  # `< /dev/null` so an unauthenticated CLI errors instead of prompting for a login, and
  # `timeout` so a dead network can't hang here: a preflight must never itself become the
  # reason a suite cannot start, by hanging any more than by erroring.
  MIGRATION_LIST=""
  if ! MIGRATION_LIST="$(timeout 60 npx supabase migration list < /dev/null 2>/dev/null)"; then
    echo "Note: schema preflight skipped — 'npx supabase migration list' did not answer (no linked project, no access token, or no network). Continuing." >&2
  else
    # `migration list` prints ` <local> | <remote> | <time>`, and its Local column *is* this
    # branch's supabase/migrations/ — the CLI has already done the comparison, so a row with a
    # blank Local and a version-shaped Remote is exactly /sync-migrations' "remote-only" set,
    # made executable on the run path. Header, rule, blank, and the CLI's update-notice lines
    # all fall out of that filter. A here-string, not a pipe, so the array survives the loop.
    REMOTE_ONLY=()
    while IFS='|' read -r local_version remote_version _rest; do
      local_version="${local_version//[[:space:]]/}"
      remote_version="${remote_version//[[:space:]]/}"
      if [ -z "$local_version" ] && [[ $remote_version =~ ^[0-9]+$ ]]; then
        REMOTE_ONLY+=("$remote_version")
      fi
    done <<< "$MIGRATION_LIST"

    if [ ${#REMOTE_ONLY[@]} -gt 0 ]; then
      echo "Error: the dev database's schema is ahead of this branch — aborting before the suite starts." >&2
      echo "Applied on the dev project, but not declared by this branch:" >&2
      # Only on the path that is already aborting, so the passing case pays for neither: a fetch,
      # without which `git log --all` can't see a sibling's just-pushed branch, and
      # workflow-context.sh, which is the one place the label -> base-branch rule lives (#1118).
      #
      # Both carry the same no-hang guard as the CLI call above, and for the same reason — the
      # path that has already decided to abort is the one that most needs to fail fast. `timeout`
      # bounds them; GIT_TERMINAL_PROMPT=0 turns a credential prompt into an error, which a
      # stdin redirect can't do on its own since git opens /dev/tty directly; and
      # workflow-context.sh's "never fails" contract is about its exit status, not about the
      # `gh` round trips inside it blocking. Each falls back to empty, which the branches below
      # already handle as "base not resolvable".
      GIT_TERMINAL_PROMPT=0 timeout 30 git fetch --quiet origin < /dev/null 2>/dev/null || true
      PREFLIGHT_BASE="$(timeout 30 bash scripts/workflow-context.sh < /dev/null 2>/dev/null | sed -n 's/^base=//p')" || true
      PREFLIGHT_BASE_FILES=""
      if [ -n "$PREFLIGHT_BASE" ]; then
        PREFLIGHT_BASE_FILES="$(git ls-tree --name-only "origin/$PREFLIGHT_BASE" supabase/migrations/ 2>/dev/null || true)"
      fi
      for version in "${REMOTE_ONLY[@]}"; do
        # `%S` is the ref `--all` reached the commit through, oldest commit last — so the last
        # *branch* ref is the branch that added the file. Branch refs only: `--all` walks tags
        # too, and a version whose sole trace is an old release tag (a since-renamed migration,
        # say) is the drift case below, not a sibling waiting to merge — reporting it as
        # "added by branch 'refs/tags/v2.0.3'" would hand out the wrong fix. awk rather than a
        # `grep -m1`, which would stop reading early (scripts/CLAUDE.md's pipefail hazard);
        # `|| true` so a non-zero `git log` can't `set -e` the script out mid-loop and truncate
        # the very diagnostic this block exists to print.
        owner="$(git log --all --source --format='%S' -- "supabase/migrations/${version}_*.sql" 2>/dev/null |
          awk '/^refs\/(heads|remotes)\//{ b = $0 } END { if (b != "") print b }')" || true
        owner="${owner#refs/heads/}"
        owner="${owner#refs/remotes/}"
        if [ -n "$PREFLIGHT_BASE" ] && grep -q "/${version}_" <<< "$PREFLIGHT_BASE_FILES"; then
          echo "  $version — carried by origin/$PREFLIGHT_BASE. Fix: git merge origin/$PREFLIGHT_BASE" >&2
        elif [ -n "$owner" ]; then
          echo "  $version — added by branch '$owner', which has not merged${PREFLIGHT_BASE:+ to $PREFLIGHT_BASE}. Fix: wait for that branch's PR to merge, then re-run." >&2
        else
          # /sync-migrations' third case: no branch anywhere owns the file, which is genuine
          # drift rather than a sibling's unmerged work.
          echo "  $version — no branch in this repo owns it, so this is drift rather than a sibling's unmerged work. See /sync-migrations." >&2
        fi
      done
      if [ -z "$PREFLIGHT_BASE" ]; then
        # No merge suggestion rather than a guessed one: /sync-migrations refuses to guess a base
        # too, and unlike that skill this path has nobody to ask.
        echo "(Could not determine this branch's base, so the versions above are unsplit — check by hand whether your base already carries them.)" >&2
      fi
      echo "All worktrees share one dev Supabase project, so a sibling branch's schema stays applied for as long as its PR is open. Running anyway would fail every spec's beforeAll with nothing pointing at the cause (#1295)." >&2
      exit 1
    fi
  fi
fi

echo "Checking Playwright system dependencies..."
if ! npx playwright install-deps chromium --dry-run; then
  echo "Error: missing Playwright system dependencies (see above). Run 'sudo npx playwright install-deps chromium' yourself, then re-run this script." >&2
  exit 1
fi

echo "Ensuring Playwright Chromium browser is installed..."
npx playwright install chromium

# Picks a free port, starts `next start` on it, and leaves SERVER_PORT/SERVER_PGID set for the EXIT
# trap. The port is ephemeral and deliberately *not* in workflow-context.sh's per-worktree map:
# nothing outside this run needs to reach this server, and a fixed port would be one more thing two
# concurrent runs could contend for.
start_server() {
  local attempt pid i up server_log_text
  for attempt in 1 2; do
    # The kernel picks the port — bind 0, read it back, close — rather than this script probing
    # `ss` for a free one, which answers a question about the past. `node` rather than `python3`
    # because node is the one interpreter this repo already requires.
    SERVER_PORT="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')"
    echo "Starting this run's own production server on port $SERVER_PORT (log: $SERVER_LOG)..."
    # TZ=UTC for exactly the reason package.json's `dev` script pins it (#1221): the suite's
    # barn-vs-host timezone axis (docs/e2e-framework-facts.md fact 12) is framed on the server
    # being UTC, and a server on the developer's own zone would move it silently.
    # -H 127.0.0.1 because Next's default hostname is 0.0.0.0, which would put the app — pointed at
    # a real Supabase project — on the LAN for the length of every run. Nothing outside this run
    # needs to reach it, which is the same premise the ephemeral port rests on. Addressed by IP
    # rather than by name everywhere below, so `localhost` resolving to ::1 before 127.0.0.1 can
    # never leave the readiness check or a Chromium request talking to nothing.
    # setsid so the server is its own process group and stop_server can kill it whole; the explicit
    # redirect keeps its output out of checklist-suite.log, which this script's stdout is a tee into.
    # `3>&-` closes the saved console descriptor (#1621). This server is `setsid`'d and so outlives a
    # SIGKILL of this script, and fd 3 is a descriptor onto the *caller's* stdout — the one thing the
    # harness's SIGKILL case pins is that a killed run closes it rather than hanging the reader
    # forever. Without this, adding fd 3 would have handed that property straight back.
    TZ=UTC setsid npx next start -p "$SERVER_PORT" -H 127.0.0.1 > "$SERVER_LOG" 2>&1 < /dev/null 3>&- &
    pid=$!
    # `|| true`: a server that died before this ran is a branch handled just below, not a failure
    # that should `set -e` the script out mid-assignment (#1569 shipped that bug once already).
    SERVER_PGID="$(ps -o pgid= -p "$pid" | tr -d ' ')" || true
    if [ -z "$SERVER_PGID" ]; then
      # The server died before `ps` could see it. If it lost the port race, that is the very
      # condition the readiness loop below retries for, just reached a few milliseconds earlier —
      # so retry here too. Without this branch the retry misses the exact case it was written for,
      # failing fatally on the fast version of the race and recovering only from the slow one.
      if [[ "$(cat "$SERVER_LOG" 2>/dev/null || true)" == *EADDRINUSE* ]]; then
        echo "Port $SERVER_PORT was taken before next start could bind it — retrying on a fresh port."
        continue
      fi
      echo "Error: the production server exited immediately. Last 40 lines of $SERVER_LOG:" >&2
      tail -40 "$SERVER_LOG" >&2
      exit 1
    fi

    up=false
    for ((i = 0; i < 60; i++)); do
      if curl -sf -o /dev/null "http://127.0.0.1:$SERVER_PORT/"; then
        up=true
        break
      fi
      # A lost race for the port surfaces here and nowhere else: the explicit -p above disables
      # Next's port-hunting fallback, so the server exits rather than moving, and without this
      # branch the only symptom would be the 120s timeout below blaming the wrong thing. The
      # window is between the kernel handing the port out and next start binding it — small, but
      # the ephemeral range is also where outbound sockets come from. Captured into a variable
      # rather than piped into `grep -q`, per scripts/CLAUDE.md's pipefail race.
      server_log_text="$(cat "$SERVER_LOG" 2>/dev/null || true)"
      if [[ $server_log_text == *EADDRINUSE* ]]; then
        echo "Port $SERVER_PORT was taken before next start could bind it — retrying on a fresh port."
        break
      fi
      sleep 2
    done
    if [ "$up" = true ]; then
      echo "Production server up on port $SERVER_PORT (pgid $SERVER_PGID, this script's pgid $SCRIPT_PGID)."
      return 0
    fi
    # Kill what we started, but deliberately *not* through stop_server: that waits for the port to
    # be released, and on the retry path the port is held by whoever won the race rather than by us,
    # so the wait could only run out its budget and then print a SIGKILL warning naming our own
    # recovery as a failure. Our server never bound the port, so there is nothing of ours to wait
    # for. Clearing SERVER_PGID also leaves the EXIT trap's stop_server correctly a no-op on the
    # give-up path below. Same own-process-group refusal as `stop_server`'s, and for the same
    # reason — this call site is reached before that one on the retry path, so a guard on only one
    # of them would still let a bad pgid lookup SIGTERM the run that is doing the looking.
    if [ -n "$SCRIPT_PGID" ] && [ "$SERVER_PGID" = "$SCRIPT_PGID" ]; then
      echo "WARNING: not killing pgid $SERVER_PGID on the retry path — it is this script's own process group." >&2
    else
      kill -- "-$SERVER_PGID" 2>/dev/null || true
    fi
    SERVER_PGID=""
  done

  # Deliberately not "never answered within 120s": both attempts can end in seconds by losing the
  # port race, and a message naming a timeout that never elapsed points at the wrong cause — the
  # same mistake the EADDRINUSE branch above exists to avoid.
  echo "Error: could not start a production server after 2 attempts. Last 40 lines of $SERVER_LOG:" >&2
  tail -40 "$SERVER_LOG" >&2
  exit 1
}

# The suite serves itself (#1601). A `next start` serves what it compiled at build time, so no route
# is compiled inside a test's own timeout budget and nothing the run touches has to be thrown away
# afterwards — which is what retired #1569's post-run recycle along with the ~10 GB it existed to
# reclaim. The developer's `next dev` is not involved at any point: Next 16 puts development builds
# under `.next/dev` and production output under `.next`, so a build here cannot disturb a dev server
# running in this same worktree.
#
# Placed after the schema preflight, so an abort doesn't first pay for a build, and outside the
# e2e slot acquired below, so a build never extends the slot every other worktree is queued on.
if [ -n "$BASE_URL" ]; then
  echo "Targeting the existing server at $BASE_URL — skipping the production build and start (--base-url)."
else
  echo "Building this branch for production (log: $BUILD_LOG)..."
  BUILD_START=$SECONDS
  # Redirected to its own file rather than inherited into checklist-suite.log: the build's route
  # table is ~60 lines that every later turn of the invoking session re-pays as cache-read input,
  # which is the cost #1356 took out of this script's stdout. The failure path prints what matters.
  if ! TZ=UTC npx next build > "$BUILD_LOG" 2>&1; then
    echo "Error: 'next build' failed — the suite cannot serve a branch that does not build. Last 40 lines:" >&2
    tail -40 "$BUILD_LOG" >&2
    exit 1
  fi
  echo "Build completed in $((SECONDS - BUILD_START))s."
  start_server
fi

# 127.0.0.1 rather than `localhost`, matching the `-H 127.0.0.1` the server binds with: this is the
# origin Playwright hands to Chromium, so spelling it by name would reintroduce the one resolution
# hazard the explicit bind exists to remove — a host where `localhost` answers ::1 first.
E2E_BASE_URL="${BASE_URL:-http://127.0.0.1:$SERVER_PORT}"

PLAYWRIGHT_ARGS=()
if [ "$MODE" = "auto" ]; then
  PLAYWRIGHT_ARGS+=(--grep-invert @visual)
else
  PLAYWRIGHT_ARGS+=(--headed)
fi
PLAYWRIGHT_ARGS+=("${SPEC_ARGS[@]}")

echo "Seeding one barn per spec file per Playwright project, prefixed $RUN_PREFIX..."
echo "  If this run is killed, clean up with: bash scripts/teardown-test-barn.sh ${PROD_FLAG[*]} --prefix $RUN_PREFIX"
# Named here rather than only in stop_server's own output, because a SIGKILL of this script is the
# one thing its EXIT trap cannot survive, and setsid means the server would outlive it. Spelled as
# an `if` rather than `[ … ] && echo …`, which under `set -e` exits the script on the empty case.
if [ -n "$SERVER_PGID" ]; then
  echo "  ...and kill this run's server with: fuser -k $SERVER_PORT/tcp"
fi
SEEDED=true

# Captured rather than left to `set -e` so --hold-open still prompts on a failing run — which
# is when holding the barns open to inspect them matters most.
#
# Playwright runs under `e2e-slot.sh` (#1295), which blocks until the one machine-wide slot is free
# (#1598 dropped it from two). Wrapping only this call is deliberate, and the boundary is drawn in
# two directions: the build above stays outside, so a two-minute build never extends the slot every
# other worktree is queued on, and the --hold-open prompt below stays outside, so a human walking a
# checklist in the seeded barns blocks nobody.
# The wrapper `exec`s, so the env prefix here still reaches Playwright and $? is still Playwright's
# own status. Unconditional, single-spec runs included — RAM is the constraint whether the run is
# one spec or seventy-three, and the exemption single-spec runs held under /fableFleet's prose mutex
# existed only because a human had to grant that lock.
#
# `3>&-` for the same reason `start_server` has it (#1621): a leaked browser must not inherit a
# descriptor onto the caller's stdout. It deliberately does *not* stop a leak holding fd 1 — that is
# the writer's fifo, and a leak holding it is exactly what `cleanup`'s bounded drain is for.
PW_EXIT=0
NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
DEV_SUPABASE_URL="$DEV_SUPABASE_URL" \
CRON_SECRET="$CRON_SECRET" \
E2E_BASE_URL="$E2E_BASE_URL" \
E2E_RUN_PREFIX="$RUN_PREFIX" \
E2E_ALLOW_PROD="$ALLOW_PROD" \
E2E_HOLD_OPEN="$HOLD_OPEN" \
  bash scripts/e2e-slot.sh npx playwright test "${PLAYWRIGHT_ARGS[@]}" 3>&- || PW_EXIT=$?

if [ "$HOLD_OPEN" = true ]; then
  echo
  echo "Test barns prefixed $RUN_PREFIX are still up at $E2E_BASE_URL — run your manual checklist steps now."
  # `|| true` because `read` returns non-zero on EOF (no tty / stdin closed), which under
  # `set -e` would abort the script before the `exit "$PW_EXIT"` below — reporting a failure
  # for a suite that passed.
  read -r -p "Press Enter to tear it down: " _ || true
fi

exit "$PW_EXIT"
