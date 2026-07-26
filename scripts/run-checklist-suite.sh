#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

usage() {
  cat >&2 <<'EOF'
Usage: run-checklist-suite.sh [--interactive] [--base-url <origin>] [--spec <path>] [--allow-prod] [--hold-open]

  --interactive     Headed run including @visual specs (default: headless, @visual excluded)
  --base-url URL    Origin under test (default: http://localhost:3000)
  --spec PATH       Playwright spec path or glob; repeatable (default: full suite)
  --allow-prod      Target a non-dev Supabase project; requires --base-url
  --hold-open       Prompt before teardown, so the seeded barn survives manual checklist steps
EOF
}

MODE=auto
BASE_URL=""
ALLOW_PROD=false
HOLD_OPEN=false
SPEC_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --interactive)
      MODE=interactive
      shift
      ;;
    --base-url)
      BASE_URL="${2:-}"
      if [ -z "$BASE_URL" ]; then
        echo "Error: --base-url requires an origin (e.g. http://localhost:3001)" >&2
        usage
        exit 1
      fi
      shift 2
      ;;
    --spec)
      if [ -z "${2:-}" ]; then
        echo "Error: --spec requires a spec path or glob" >&2
        usage
        exit 1
      fi
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
DEV_SUPABASE_URL="$(parse_var DEV_SUPABASE_URL || true)"

for var_name in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do
  if [ -z "${!var_name}" ]; then
    echo "Error: $var_name is not set in .env.local" >&2
    exit 1
  fi
done

# Same meaning as in seed-test-barn.sh/teardown-test-barn.sh/change-user.sh/seed-account.sh:
# it bypasses their assertDevProject check. This script has no dev-project check of its own —
# .env.local alone picks the Supabase project (those scripts re-read it and ignore any env
# override), so without this flag the seed/teardown calls below stay fail-closed on non-dev.
PROD_FLAG=()
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

BARN_SLUG="e2e-$(date +%s)-$RANDOM"

cleanup() {
  bash scripts/teardown-test-barn.sh "${PROD_FLAG[@]}" "$BARN_SLUG"
}
trap cleanup EXIT
# Bash already runs an EXIT trap when the shell dies of SIGINT, so teardown would survive
# Ctrl-C without this. It's here to make that a property of the script rather than of bash's
# default signal handling, and to pin the exit status at 130 — the seeded barn outliving a
# Ctrl-C is exactly the leak this script exists to prevent.
trap 'exit 130' INT

echo "Seeding test barn $BARN_SLUG..."
echo "  If this run is killed, clean up with: bash scripts/teardown-test-barn.sh ${PROD_FLAG[*]} $BARN_SLUG"
bash scripts/seed-test-barn.sh "${PROD_FLAG[@]}" "$BARN_SLUG"

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

# Captured rather than left to `set -e` so --hold-open still prompts on a failing run — which
# is when holding the barn open to inspect it matters most.
PW_EXIT=0
NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
E2E_BASE_URL="$E2E_BASE_URL" \
TEST_BARN_SLUG="$BARN_SLUG" \
  npx playwright test "${PLAYWRIGHT_ARGS[@]}" || PW_EXIT=$?

if [ "$HOLD_OPEN" = true ]; then
  echo
  echo "Test barn $BARN_SLUG is still up at $E2E_BASE_URL — run your manual checklist steps now."
  read -r -p "Press Enter to tear it down: " _
fi

exit "$PW_EXIT"
