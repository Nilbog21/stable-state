#!/usr/bin/env bash
set -euo pipefail

# A counting semaphore for the e2e suite, held by the kernel (#1295).
#
#   e2e-slot.sh [--exclusive] <command> [args...]
#
# Acquires one of SLOTS slots, then `exec`s the command — so the **command itself** is the lock
# holder, not a supervising shell. `flock` releases on fd close, which the kernel does on process
# death including `SIGKILL`, so there is no stale lock, no reaper, and nothing to clean up after an
# OOM kill or a Ctrl-C. That is the property a *voluntarily* released lock — one an MCP server or an
# orchestrator hands out — cannot provide, and it is why this exists rather than more prose in
# `/fableFleet`.
#
# `--exclusive` takes all of them, which is how `/sync-migrations` keeps `npx supabase db push` and
# a suite run off each other in both directions: a push landing mid-run leaves the suite reading
# half-applied schema and failing in ways no spec author can diagnose from inside their own issue.
#
# At 2 slots this is simultaneously a **cap** for human-driven runs across the five worktrees — the
# thing that was missing when two OOM kills took the machine — and a **raise** for `/fableFleet`,
# whose prose mutex allowed exactly one multi-spec run fleet-wide.

# Sized to the machine, not to the fleet: two full suites at `workers: 2` is the load one 32 GB host
# absorbs without swapping. Raising it re-opens the failure this script closed. Deliberately a
# constant and not a flag — a second value would only ever be a way to opt out of the cap.
SLOTS=2

# `/run/user/$UID` is already per-user and mode 0700, so slot files carry no /tmp symlink surface and
# need no ownership check. It is also tmpfs, which is correct: a stale slot file across a reboot
# would be meaningless anyway, since the locks live on open fds rather than on the files. The
# fallback covers a context with no session bus (a cron shell, a container); `E2E_SLOT_DIR` is the
# override, and `scripts/e2e-slot.test.sh` is its only user.
SLOT_DIR="${E2E_SLOT_DIR:-${XDG_RUNTIME_DIR:-/tmp/stable-state-run-$(id -u)}/stable-state-e2e-slots}"

# How long to wait between sweeps when nothing is free. A suite run is minutes, so a tighter poll
# buys nothing and a looser one delays a fleet worker for no reason.
RETRY_SECS=5

usage() {
  cat >&2 <<'EOF'
Usage: e2e-slot.sh [--exclusive] <command> [args...]

  Runs <command> holding one of the e2e slots, blocking until one is free.

  --exclusive   Hold every slot for the duration, so nothing else runs alongside.
                Used by /sync-migrations to keep `supabase db push` off a live suite run.

  E2E_SLOT_DIR  Override the slot directory (tests only).
EOF
}

EXCLUSIVE=false
if [ "${1:-}" = "--exclusive" ]; then
  EXCLUSIVE=true
  shift
fi

if [ $# -eq 0 ]; then
  echo "Error: e2e-slot.sh requires a command to run" >&2
  usage
  exit 1
fi

mkdir -p "$SLOT_DIR"

WANT=1
[ "$EXCLUSIVE" = true ] && WANT=$SLOTS

# fds currently held by this shell. Tracked so a failed sweep can hand every one of them back before
# sleeping — see the deadlock note on try_acquire below.
HELD=()

release_held() {
  local fd
  for fd in "${HELD[@]:-}"; do
    [ -n "$fd" ] && eval "exec $fd>&-"
  done
  HELD=()
}

# One non-blocking sweep for WANT slots. Returns 0 with HELD populated, or non-zero having released
# everything it took.
#
# **No deadlock, two properties.** A single-slot acquire holds nothing while it probes the next slot
# — each failed `flock -n` closes its fd immediately — so it can never sit on slot 1 waiting for
# slot 2. An `--exclusive` acquire does hold slots as it climbs, but takes them in a fixed order and
# **releases every one before retrying**, so two exclusives contend on slot 1 first and one of them
# wins outright rather than each pinning a slot the other needs.
try_acquire() {
  local i fd got=0
  for ((i = 1; i <= SLOTS; i++)); do
    exec {fd}>"$SLOT_DIR/slot-$i"
    if flock -n "$fd"; then
      HELD+=("$fd")
      got=$((got + 1))
      [ "$got" -eq "$WANT" ] && return 0
    else
      eval "exec $fd>&-"
      # An exclusive acquire needs *every* slot, so a single miss makes the whole sweep a loss —
      # bail now rather than collecting the rest and holding them through the sleep.
      if [ "$EXCLUSIVE" = true ]; then
        release_held
        return 1
      fi
    fi
  done
  release_held
  return 1
}

waited=false
until try_acquire; do
  if [ "$waited" = false ]; then
    waited=true
    # Said once, on stderr, because the caller is usually reading a log file and an unexplained
    # multi-minute gap before Playwright's first line reads as a hang.
    if [ "$EXCLUSIVE" = true ]; then
      echo "e2e-slot: waiting for all $SLOTS e2e slots (another suite run is in flight)..." >&2
    else
      echo "e2e-slot: all $SLOTS e2e slots are busy — waiting for one to free up..." >&2
    fi
  fi
  sleep "$RETRY_SECS"
done

[ "$waited" = true ] && echo "e2e-slot: acquired." >&2

# ponytail: `flock` gives a waiter no queue position, so a steady stream of single-slot acquires can
# in principle starve `--exclusive` indefinitely. Left alone because both are minutes-long and
# human- or orchestrator-paced at 2 slots. If it ever bites: add a gate file that acquires take a
# *shared* lock on for the run's duration and `--exclusive` takes exclusively, which turns the
# starvation into ordinary reader/writer contention.
#
# ponytail: no preflight free-RAM guard here. Recycle-on-exit (#1569), the dev server's
# `--max-old-space-size` backstop and this semaphore are three independent guards on the same
# failure; a fourth earns its place only if an OOM survives all three, and then it belongs right
# above this line.

# `exec`, so the held fds pass to the command and the lock's lifetime is the command's own. Nothing
# supervises it, nothing has to translate its exit status, and a `SIGKILL` anywhere frees the slot.
exec "$@"
