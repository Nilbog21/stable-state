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
Usage: run-checklist-suite.sh [--interactive] [--base-url <origin>] [--spec <path>] [--allow-prod] [--hold-open] [--verbose]

  --interactive     Headed run including @visual specs (default: headless, @visual excluded); implies --verbose
  --base-url URL    Origin under test (default: http://localhost:3000)
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
  npx playwright test "${PLAYWRIGHT_ARGS[@]}" || PW_EXIT=$?

if [ "$HOLD_OPEN" = true ]; then
  echo
  echo "Test barns prefixed $RUN_PREFIX are still up at $E2E_BASE_URL — run your manual checklist steps now."
  # `|| true` because `read` returns non-zero on EOF (no tty / stdin closed), which under
  # `set -e` would abort the script before the `exit "$PW_EXIT"` below — reporting a failure
  # for a suite that passed.
  read -r -p "Press Enter to tear it down: " _ || true
fi

exit "$PW_EXIT"
