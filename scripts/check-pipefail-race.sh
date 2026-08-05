#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Fails if a `pipefail` script pipes into a consumer that can exit before its producer is done
# writing — `grep -q`, `grep -m N`, `head`. The producer then dies on SIGPIPE (141) and pipefail
# reports that as the pipeline's status, so a pipeline that succeeded reads as a failure, or (the
# dangerous polarity) one that failed reads as a pass. See scripts/CLAUDE.md's "Shell hazards".
#
# A line carrying `# pipefail-safe: <reason>` is exempt — that is where the polarity argument goes.
#
# The test is deliberately coarse — a segment whose command is `head`, or one whose command is
# `grep` and whose text contains an early-exit flag anywhere. It does **not** parse grep's flag
# grammar. An earlier cut did, and telling a flag from an argument means tokenizing, which is
# wrong wherever a quoted value holds a space: `grep -e "foo bar" -q` read as safe, a real race
# missed in the fail-open direction. Not tokenizing costs the mirror cases instead — `grep -- -q`
# and `grep -e -q`, where the `-q` *is* the pattern, now flag — and `# pipefail-safe:` is the
# one-line answer for those. Over-flagging is affordable; missing a race is what this gate exists
# to prevent. Measured before choosing: on this repo the coarse rule finds exactly what the
# grammar walk found, which is nothing.
#
# Pipes are found by splitting the line on `|` after masking `||`, so `cmd || grep -q x` doesn't
# register — a `||` fallback has no producer to take SIGPIPE. Only segments after the first are
# tested, which is what lets a pipe opening a continuation line match. The split isn't quote-aware:
# harmless in the common shape (`grep -qE "fix|feat"` still flags, the `-q` riding in the same
# segment as the `grep`), and a miss in the rare inverse `grep -e "a|b" -q` — which joins the older
# ceiling, a flag placed after the pattern (`grep needle -q`). It also makes a line-leading `|`
# inside a quoted multi-line string matchable (workflow-ci-wait.sh's jq filter has several);
# `# pipefail-safe:` is the answer if one ever collides with grep/head.

# Does this pipe segment's command stop reading before its input is drained?
early_exit_consumer() {
  local -a words
  read -ra words <<<"$1"
  case "${words[0]:-}" in
    head) return 0 ;;
    # `--quiet` and `--max-count` need no alternative of their own — they contain `-q` and `-m`.
    grep) case "$1" in *-q* | *-m* | *--silent*) return 0 ;; esac ;;
  esac
  return 1
}

# Does this line pipe into such a consumer?
pipes_into_early_exit() {
  local masked="${1//||/$'\001'}" k
  local -a segs
  IFS='|' read -ra segs <<<"$masked"
  for ((k = 1; k < ${#segs[@]}; k++)); do
    early_exit_consumer "${segs[k]}" && return 0
  done
  return 1
}

fail=0
for f in scripts/*.sh; do
  # *.test.sh files embed hazardous pipelines as literal *fixture text*, which no scanner can
  # tell apart from a real one. They are `if`/assert harnesses with no pipefail of their own.
  case "$f" in scripts/*.test.sh) continue ;; esac
  grep -q 'pipefail' "$f" || continue

  n=0
  # `|| [ -n "$line" ]` catches a final line with no trailing newline — `read` fills `$line` but
  # returns non-zero, so testing its status alone silently drops that line.
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    case "$line" in *'pipefail-safe:'*) continue ;; esac
    if [[ "$line" =~ ^[[:space:]]*# ]]; then continue; fi
    pipes_into_early_exit "$line" || continue
    echo "FAIL: $f:$n:$line" >&2
    fail=1
  done < "$f"
done

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "A pipefail pipeline feeding grep -q / grep -m / head can report the wrong verdict when" >&2
  echo "the producer dies on SIGPIPE. Restructure it, or annotate the line with" >&2
  echo "'# pipefail-safe: <why the polarity is safe>'. See scripts/CLAUDE.md." >&2
else
  echo "OK: no pipefail script pipes into an early-exit consumer"
fi

exit $fail
