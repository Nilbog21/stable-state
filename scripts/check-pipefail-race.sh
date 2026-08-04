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
# The verdict walks grep's own flag grammar word by word rather than pattern-matching the line,
# because the thing that decides it is whether a `-q`-looking token is a *flag* or an *argument*.
# A flag taking a space-separated value swallows the next word, which cuts both ways and wrongly
# in both directions under a regex: `grep -e needle -q` is a real race whose `-q` sits past the
# value, and `grep -e -q` is safe because its `-q` *is* the value. `--` ends the flag region for
# the same reason. Within a cluster the q/m is a prefix, not the whole of it, so `grep -qi`/`-qE`
# and the no-space `-m1` are caught; an attached value (`-A2`) consumes nothing further.
#
# The ceiling is that the flag region ends at the first word not starting with `-`, so a flag
# placed *after* the pattern (`grep needle -q`) is a miss. Scanning past it would run through a
# `&&`/`;` into an unrelated command's `-q`, and a false positive here hard-fails CI on safe code
# — worse than the miss, on a gate whose own value is that it isn't noise.
#
# Pipes are found by splitting the line on `|` after masking `||`, so `cmd || grep -q x` doesn't
# register — a `||` fallback has no producer to take SIGPIPE. Only segments after the first are
# tested, which is what lets a pipe opening a continuation line match. That also makes a
# line-leading `|` inside a quoted multi-line string matchable (workflow-ci-wait.sh's jq filter
# has several); `# pipefail-safe:` is the answer if one ever collides with grep/head.

# Does this pipe segment's command stop reading before its input is drained?
early_exit_consumer() {
  local -a words
  read -ra words <<<"$1"
  case "${words[0]:-}" in
    head) return 0 ;;
    grep) ;;
    *) return 1 ;;
  esac

  local i=1 word rest char
  while [ "$i" -lt "${#words[@]}" ]; do
    word="${words[i]}"
    i=$((i + 1))
    case "$word" in
      --) return 1 ;;                                    # everything after it is an operand
      --quiet | --silent | --max-count | --max-count=*) return 0 ;;
      --regexp | --file | --after-context | --before-context | --context | --label | \
        --binary-files | --devices | --directories)
        i=$((i + 1)) ;;                                  # takes the next word as its value
      --*) ;;                                            # self-contained, incl. --name=value
      -?*)
        rest="${word#-}"
        while [ -n "$rest" ]; do
          char="${rest:0:1}"
          rest="${rest:1}"
          case "$char" in
            q | m) return 0 ;;
            e | f | A | B | C | d | D)
              # Last in the cluster means the value is the next word; attached means it's `$rest`.
              [ -n "$rest" ] || i=$((i + 1))
              break
              ;;
          esac
        done
        ;;
      *) return 1 ;;                                     # the pattern — the flag region ends here
    esac
  done
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
  while IFS= read -r line; do
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
