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

# Send this script's stdout and stderr — and that of everything it runs — through `tee`, so
# the log gets the whole run, including the early bails that kill it under `set -e` before
# Playwright writes a line. Either branch costs the `list` reporter its live in-place progress
# (stdout is no longer a TTY); the log keeps one static line per test, which is the better
# trade for a file read afterwards. What reaches *stdout* differs — see the branches.
if [ "$VERBOSE" = true ]; then
  exec > >(tee -a "$LOG_PATH") 2>&1
else
  # The log still gets the whole run; stdout drops only the reporter's per-test ✓/- lines,
  # which is ~190 of a 191-test run's 209 and is re-paid as cache-read input on every later
  # turn of the invoking session. Everything else passes through — this script's own echoes
  # (so early bails are untouched), `Running N tests`, ✘ lines, the failure detail blocks,
  # the pass/fail summary counts, teardown, and the exit terminator. A stream filter rather
  # than a reporter swap because the log has to keep full `list` output either way.
  # `--line-buffered` because grep block-buffers to a non-TTY, which would stall the stream.
  exec > >(tee -a "$LOG_PATH" | grep --line-buffered -vE '^  (✓|-) +[0-9]+ ') 2>&1
fi

echo "Logging to $LOG_PATH"

usage() {
  cat >&2 <<'EOF'
Usage: run-checklist-suite.sh [--interactive] [--base-url <origin>] [--spec <path>] [--allow-prod] [--hold-open] [--no-recycle] [--verbose]

  --interactive     Headed run including @visual specs (default: headless, @visual excluded); implies --verbose
  --base-url URL    Origin under test (default: http://localhost:3000)
  --spec PATH       Playwright spec path or glob; repeatable (default: full suite)
  --allow-prod      Target a non-dev Supabase project; requires --base-url
  --hold-open       Prompt before teardown, so the seeded barns survive manual checklist steps
  --no-recycle      Keep the dev server the suite just fattened, instead of restarting it. For
                    iterating on a failing suite in a single worktree, where a warm server is
                    worth the ~9 GB it holds. Never for a run you are walking away from.
  --verbose         Stream the reporter's per-test lines to stdout too (default: log only)
EOF
}

MODE=auto
BASE_URL=""
ALLOW_PROD=false
HOLD_OPEN=false
RECYCLE=true
SPEC_ARGS=()
PROD_FLAG=()
# Flipped just before Playwright starts, so an early bail (bad flag, missing .env.local,
# unreadable Supabase vars) doesn't call teardown before any barn could exist.
SEEDED=false

cleanup() {
  # Captured first: teardown-test-barn.sh's own status would otherwise replace the status
  # the script is actually exiting with.
  local code=$?
  if [ "$SEEDED" = true ]; then
    # --prefix, not --all: --all would delete a concurrent run's barns too.
    bash scripts/teardown-test-barn.sh "${PROD_FLAG[@]}" --prefix "$RUN_PREFIX" || code=$?
  fi
  echo "=== run-checklist-suite.sh exited $code — full log: $LOG_PATH ==="
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
    --no-recycle)
      RECYCLE=false
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
  fi
done

# Same meaning as in e2e-auth-users.sh/teardown-test-barn.sh/change-user.sh/seed-account.sh:
# it bypasses their assertDevProject check. This script has no dev-project check of its own —
# .env.local alone picks the Supabase project (those scripts re-read it and ignore any env
# override), so without this flag the teardown call and the suite's own in-process
# assertDevProject (e2e/support/test.ts) both stay fail-closed on non-dev.
if [ "$ALLOW_PROD" = true ]; then
  PROD_FLAG=(--allow-prod)
  # Without an origin this seeds the target project and then drives localhost:3000 — your own
  # server, reading that same target-pointed .env.local — running mutating specs against it.
  if [ -z "$BASE_URL" ]; then
    echo "Error: --allow-prod requires --base-url (otherwise the run seeds the target project but drives localhost)" >&2
    exit 1
  fi
  # Not fatal: the flag is simply redundant on dev. Worth saying, because if --base-url points
  # somewhere this project doesn't back, global-setup.ts mints cookies named for the wrong
  # project ref and every spec fails on auth with no hint as to why.
  if [ "$NEXT_PUBLIC_SUPABASE_URL" = "$DEV_SUPABASE_URL" ]; then
    echo "Note: --allow-prod is a no-op here — .env.local points at the dev project ($DEV_SUPABASE_URL)." >&2
  fi
fi

E2E_BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "Checking Playwright system dependencies..."
if ! npx playwright install-deps chromium --dry-run; then
  echo "Error: missing Playwright system dependencies (see above). Run 'sudo npx playwright install-deps chromium' yourself, then re-run this script." >&2
  exit 1
fi

echo "Ensuring Playwright Chromium browser is installed..."
npx playwright install chromium

PLAYWRIGHT_ARGS=()
if [ "$MODE" = "auto" ]; then
  PLAYWRIGHT_ARGS+=(--grep-invert @visual)
else
  PLAYWRIGHT_ARGS+=(--headed)
fi
PLAYWRIGHT_ARGS+=("${SPEC_ARGS[@]}")

echo "Seeding one barn per spec file per Playwright project, prefixed $RUN_PREFIX..."
echo "  If this run is killed, clean up with: bash scripts/teardown-test-barn.sh ${PROD_FLAG[*]} --prefix $RUN_PREFIX"
SEEDED=true

# Captured rather than left to `set -e` so --hold-open still prompts on a failing run — which
# is when holding the barns open to inspect them matters most.
#
# Playwright runs under `e2e-slot.sh` (#1295), which blocks until one of two machine-wide slots is
# free — the cross-worktree half of the memory fix whose per-run half is `workers: 2`. Wrapping only
# this call is deliberate: the acquire covers exactly the span that loads the dev server, so the
# --hold-open prompt below and the recycle before it hold no slot while a human walks a checklist.
# The wrapper `exec`s, so the env prefix here still reaches Playwright and $? is still Playwright's
# own status. Unconditional, single-spec runs included — RAM is the constraint whether the run is
# one spec or seventy-three, and the exemption single-spec runs held under /fableFleet's prose mutex
# existed only because a human had to grant that lock.
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
  bash scripts/e2e-slot.sh npx playwright test "${PLAYWRIGHT_ARGS[@]}" || PW_EXIT=$?

# Written as a loop over a captured value rather than `ss … | grep -q`, which is scripts/CLAUDE.md's
# pipefail race. Non-zero if the port is still held when the budget runs out, so the caller can
# escalate instead of relaunching into it.
wait_for_port_release() {
  local port="$1" secs="$2" i
  for ((i = 0; i < secs; i++)); do
    [ -z "$(ss -lntH "sport = :$port")" ] && return 0
    sleep 1
  done
  [ -z "$(ss -lntH "sport = :$port")" ]
}

# A `next dev` server costs ~1.4 GB serving one route and ~10 GB once it has served this suite,
# and never gives that back — it's route breadth, not uptime (#1569). Nothing else reclaims it:
# `/testIssue` Step 3 reuses whatever answers the port and `/finishIssue` Step 6 is the only thing
# that kills it, so the residue would sit there for the whole testIssue→finishIssue window; three
# worktrees doing that at once exhausted 32 GB of RAM and 8 GB of swap on 2026-08-17. It lives here
# rather than in each calling skill because per-skill prose is the shape that already drifted twice
# and got centralized into workflow-context.sh (#1118) and select-specs.sh (#1213).
recycle_dev_server() {
  # Scheme and path stripped off, leaving host[:port]. Only a localhost origin is ours to restart,
  # which is also what makes --allow-prod never recycle: it requires --base-url, and that origin is
  # by definition not this machine's dev server. No bracketed-IPv6 case — `%%:*` can't parse one,
  # and every caller in this repo passes http://localhost:{port}.
  local hostport="${E2E_BASE_URL#*://}"
  hostport="${hostport%%/*}"
  local host="${hostport%%:*}" port="${hostport##*:}"
  case "$host" in
    localhost | 127.0.0.1) ;;
    *)
      echo "Skipping dev-server recycle: $E2E_BASE_URL is not localhost."
      return 0
      ;;
  esac
  # No colon, so the origin's port is the scheme default — not a `next dev` this repo started.
  if [ "$port" = "$host" ]; then
    echo "Skipping dev-server recycle: $E2E_BASE_URL names no port."
    return 0
  fi

  # `ss`, not `lsof` (#1155): lsof returns empty for a live next-server that ss reports a pid for
  # immediately, with or without -sTCP:LISTEN. `tail -1`, not `head -1`, because head stops reading
  # and under `pipefail` the SIGPIPE'd producer then reports the whole pipeline as failed — the
  # race scripts/check-pipefail-race.sh exists to catch. tail drains, and the extra lines it reads
  # past are the same listener on another address family anyway.
  # `|| true` because nothing listening is a *branch*, not a failure: grep exits 1, pipefail makes
  # that the pipeline's status, and `set -e` would abort the script mid-assignment — leaving the
  # "nothing to recycle" branch below unreachable and the skip silent.
  local pid
  pid="$(ss -lptnH "sport = :$port" | grep -oP 'pid=\K[0-9]+' | tail -1)" || true
  if [ -z "$pid" ]; then
    echo "No dev server listening on port $port — nothing to recycle."
    return 0
  fi

  # npm → next → next-server share one PGID. Killing the pid alone orphans the children that
  # actually hold the port, and the relaunch below then dies on EADDRINUSE — an explicit -p
  # disables Next's port-hunting fallback.
  # Same `|| true` reasoning as the pid lookup: `ps` exits 1 if the process is already gone.
  local pgid
  pgid="$(ps -o pgid= -p "$pid" | tr -d ' ')" || true
  if [ -z "$pgid" ]; then
    echo "Dev server pid $pid vanished before it could be recycled — nothing to do."
    return 0
  fi
  echo "Recycling dev server on port $port (pid $pid, pgid $pgid) — it is holding this run's compiled routes."

  # SIGINT is ignored from here until the relaunch is airborne. A Ctrl-C in between would leave the
  # port with no server and no diagnosis — the one window in this script where an interrupt destroys
  # state rather than just abandoning it. Restored before `setsid` so the child doesn't inherit the
  # ignore, which would outlive this script along with it.
  trap '' INT

  # The relaunch loses the race to a port the kernel hasn't released yet, so wait for it — and
  # escalate rather than launching into a port that's still held. The explicit -p below disables
  # Next's port-hunting fallback, so a relaunch that loses this race dies on EADDRINUSE and the
  # only symptom is the 90s timeout further down: a dead port behind a misleading message.
  if ! wait_for_port_release "$port" 15; then
    echo "Dev server on port $port still holds it 15s after SIGTERM — escalating to SIGKILL."
    kill -9 -- "-$pgid" 2>/dev/null || true
    if ! wait_for_port_release "$port" 5; then
      trap 'exit 130' INT
      echo "WARNING: port $port is still held after SIGKILL, so it is not this run's dev server — not relaunching, since an explicit -p would only fail with EADDRINUSE. Holder: $(ss -lptnH "sport = :$port")" >&2
      return 0
    fi
  fi
  trap 'exit 130' INT

  # setsid: the fresh server has to outlive this script — the next /testIssue step reuses whatever
  # answers the port — and needs its own session so it isn't in the process group of whatever kills
  # this one. `/finishIssue` Step 6 still finds it, since that resolves the pid from the port.
  # The explicit redirect is what keeps `next dev`'s output out of checklist-suite.log: this
  # script's own stdout is a tee into that file, and the child would otherwise inherit it.
  setsid npm run dev -- -p "$port" > "/tmp/devserver-$port.log" 2>&1 < /dev/null &

  local up=false i
  for ((i = 0; i < 45; i++)); do
    if curl -sf -o /dev/null "http://localhost:$port/"; then
      up=true
      break
    fi
    sleep 2
  done
  if [ "$up" = true ]; then
    echo "Dev server back up on port $port — log: /tmp/devserver-$port.log"
  else
    # Loud rather than silent: the port is now dead, and every later step assumes it isn't.
    echo "WARNING: the recycled dev server on port $port never answered within 90s — nothing is serving that port now. See /tmp/devserver-$port.log" >&2
  fi
}

# Before the --hold-open prompt, so held-open manual steps get the fresh server; after PW_EXIT is
# captured, so it runs on a failing suite too and the script still exits with Playwright's status.
if [ "$RECYCLE" = true ]; then
  recycle_dev_server
fi

if [ "$HOLD_OPEN" = true ]; then
  echo
  echo "Test barns prefixed $RUN_PREFIX are still up at $E2E_BASE_URL — run your manual checklist steps now."
  # `|| true` because `read` returns non-zero on EOF (no tty / stdin closed), which under
  # `set -e` would abort the script before the `exit "$PW_EXIT"` below — reporting a failure
  # for a suite that passed.
  read -r -p "Press Enter to tear it down: " _ || true
fi

exit "$PW_EXIT"
