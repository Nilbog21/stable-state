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
# At one slot that is functionally a plain acquire (#1598) — kept because it states the intent its
# call site means, and because it keeps the script correct if SLOTS ever moves back up.
#
# This is a **cap**, machine-wide: on `/fableFleet`'s workers, on a human in a Greek-letter
# worktree, and on a `db push` the user fires themselves. It is the thing that was missing when two
# OOM kills took the machine.

# Sized from #1295's measurement, not from intuition: peak RSS is 10.18 GB per suite (the worktree's
# own `next dev` server) on a 29 GB host, and the cost is route breadth rather than worker count —
# `workers: 4` measured the same, so it does not shrink by tuning workers. Add ~1.4–2 GB per *idle*
# sibling `next dev` across the five worktrees and two concurrent suites land near 25 GB with no
# headroom, which is the OOM condition this script exists to close. Raising it re-opens that
# failure. Deliberately a constant and not a flag — a second value would only ever be a way to opt
# out of the cap.
SLOTS=1

# `/run/user/$UID` is already per-user and mode 0700, so slot files carry no /tmp symlink surface and
# need no ownership check. It is also tmpfs, which is correct: a stale slot file across a reboot
# would be meaningless anyway, since the locks live on open fds rather than on the files. The
# fallback covers a context with no session bus (a cron shell, a container); `E2E_SLOT_DIR` is the
# override, used by `scripts/e2e-slot.test.sh` and by `scripts/run-checklist-suite.test.sh` (#1607),
# which runs the real wrapper against a per-case temp dir so its fixtures never touch this cap.
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
                At SLOTS=1 this is the same acquire as no flag at all; see the note above.

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
      echo "e2e-slot: waiting for every e2e slot (another suite run is in flight)..." >&2
    else
      echo "e2e-slot: the e2e slots are all busy — waiting for one to free up..." >&2
    fi
  fi
  sleep "$RETRY_SECS"
done

[ "$waited" = true ] && echo "e2e-slot: acquired." >&2

# ponytail: `flock` gives a waiter no queue position, so a steady stream of single-slot acquires can
# in principle starve `--exclusive` indefinitely. Dormant at SLOTS=1, where the two are symmetric
# contenders for the same lock rather than one needing strictly more than the other, and left alone
# anyway because both are minutes-long and human- or orchestrator-paced. If it ever bites: add a
# gate file that acquires take a *shared* lock on for the run's duration and `--exclusive` takes
# exclusively, which turns the starvation into ordinary reader/writer contention.
#
# ponytail: no preflight free-RAM guard here. This used to be one of three independent guards on the
# same failure, alongside recycle-on-exit (#1569) and the dev server's `--max-old-space-size`
# backstop. #1601 removed the first by removing what it guarded: the suite serves its own production
# server now, so it fattens nothing and there is nothing to shed afterwards. Two guards remain, over a
# failure #1601 also made much smaller; a third earns its place only if an OOM survives both, and
# then it belongs right above this line.

# `exec`, so the held fds pass to the command and the lock's lifetime is the command's own. Nothing
# supervises it, nothing has to translate its exit status, and a `SIGKILL` anywhere frees the slot.
exec "$@"
