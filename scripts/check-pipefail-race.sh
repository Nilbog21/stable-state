#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Fails if a `pipefail` script pipes into a consumer that can exit before its producer is done
# writing — `grep -q`, `grep -m N`, `head`. The producer then dies on SIGPIPE (141) and pipefail
# reports that as the pipeline's status, so a pipeline that succeeded reads as a failure, or (the
# dangerous polarity) one that failed reads as a pass. See scripts/CLAUDE.md's "Shell hazards".
#
# A line carrying `# pipefail-safe: <reason>` is exempt — that is where the polarity argument goes.

CONSUMER='\|[[:space:]]*(grep[[:space:]]+-[[:alnum:]]*[qm]|head)([[:space:]]|$)'

fail=0
for f in scripts/*.sh; do
  # *.test.sh files embed hazardous pipelines as literal *fixture text*, which no scanner can
  # tell apart from a real one. They are `if`/assert harnesses with no pipefail of their own.
  case "$f" in scripts/*.test.sh) continue ;; esac
  grep -q 'pipefail' "$f" || continue

  while IFS= read -r hit; do
    line="${hit#*:}"
    case "$line" in *'pipefail-safe:'*) continue ;; esac
    echo "FAIL: $f:$hit" >&2
    fail=1
  done < <(grep -nE "$CONSUMER" "$f" | grep -v '^[0-9]*:[[:space:]]*#')
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
