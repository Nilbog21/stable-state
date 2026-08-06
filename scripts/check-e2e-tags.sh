#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Fails if a checklist line tagged `(e2e: <test name>)` names a Playwright test that does not
# exist, or one that exists but can never run. `/runChecklist` Step 0.5 maps a green suite run
# onto every `(e2e:)` checkbox; neither direction of that claim was verified, so a rename in an
# unrelated PR would launder an unverified checkbox into "green run — every (e2e:) checkbox
# passed" months later. Same drift class `select-specs.sh --lint` catches for `covers:` globs.
#
# Two checks, both over *tags*:
#   orphan        — the tag matches no test title in e2e/*.spec.ts
#   never-executes — the tag's test carries no Playwright project tag, so no project greps it in
#
# The reverse direction is deliberately not linted: a test claimed by no checklist line is
# legitimate (9 today), so flagging it would buy busywork. See docs/scripts.md.

# The files whose (e2e:) tags are data rather than prose. PRE_RELEASE_TEST_CHECKLIST.md is
# excluded: all 7 of its `(e2e:` hits are convention prose (`<test name>`, `…`).
# POST_RELEASE_TEST_CHECKLIST.md joins this list if/when POST gains (e2e:) tags — it is its own
# index, so its prose would need the same placeholder consideration first.
# A glob rather than the seven filenames: a literal list is fail-open in this gate's own failure
# class, since a phase file added later would be silently unlinted and say so nowhere.
CHECKLIST_GLOBS=('checklists/pre-release/*.md')

# The project tags, read from playwright.config.ts rather than restated here — a restated list
# drifts, and the drift is silent in the direction that matters. Each project collects tests by
# `grep: /@name/`, so a title matching none of them is collected by nothing.
projects="$(grep -oE 'grep: /@[A-Za-z0-9_]+/' playwright.config.ts | sed -E 's|grep: /@||; s|/$||' || true)"
if [ -z "$projects" ]; then
  echo "FAIL: no projects parsed out of playwright.config.ts" >&2
  echo "The never-executes check needs them; a run that resolved none would clear every tag and" >&2
  echo "print the same OK as a clean tree. Aborting rather than passing vacuously." >&2
  exit 1
fi

# Test titles, keyed by title-with-project-suffixes-stripped, valued by the full title. Only
# `test('…')` — the 5 `test(`…`)` template-literal sites can't be resolved statically, and 4 of
# them would be permanent false positives on the never-executes check, their project tag being
# `@${role}`. A checklist tag naming a *generated* title would therefore read as an orphan;
# none does today, and the generated names aren't checklist-shaped (see docs/scripts.md).
declare -A title_of
while IFS= read -r title; do
  stripped="$title"
  # Strip every trailing ` @suffix` — a title may carry several (`… @trainer @rider`), and
  # checklist tags carry none at all (0 of 711 today).
  while [[ "$stripped" =~ ^(.*)\ @[A-Za-z0-9_]+$ ]]; do
    stripped="${BASH_REMATCH[1]}"
  done
  title_of["$stripped"]="$title"
done < <(grep -ohE "^[[:space:]]*test\('[^']*'" e2e/*.spec.ts | sed -E "s|^[[:space:]]*test\('||; s|'$||")

# Does this title carry a tag some configured project greps for?
runs_under_a_project() {
  local title="$1" project
  for project in $projects; do
    case "$title" in *"@$project"*) return 0 ;; esac
  done
  return 1
}

fail=0
checked=0
for glob in "${CHECKLIST_GLOBS[@]}"; do
  for f in $glob; do
    # An unmatched glob expands to itself, which is not a file.
    [ -f "$f" ] || continue

    n=0
    # `|| [ -n "$line" ]` catches a final line with no trailing newline — `read` fills `$line`
    # but returns non-zero, so testing its status alone silently drops that line.
    while IFS= read -r line || [ -n "$line" ]; do
      n=$((n + 1))
      [[ "$line" == *"(e2e: "* ]] || continue
      # A line may carry more than one tag; take each.
      rest="$line"
      while [[ "$rest" =~ \(e2e:\ ([^\)]*)\)(.*)$ ]]; do
        tag="${BASH_REMATCH[1]}"
        rest="${BASH_REMATCH[2]}"
        checked=$((checked + 1))
        if [ -z "${title_of[$tag]+set}" ]; then
          echo "FAIL: $f:$n: (e2e: $tag) — no test with this title exists in e2e/*.spec.ts" >&2
          fail=1
        elif ! runs_under_a_project "${title_of[$tag]}"; then
          echo "FAIL: $f:$n: (e2e: $tag) — its test carries no project tag, so it never runs" >&2
          fail=1
        fi
      done
    done < "$f"
  done
done

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "A checklist (e2e:) tag naming a test that doesn't exist, or one no Playwright project" >&2
  echo "collects, is marked verified by a green suite run without anything having asserted it." >&2
  echo "Retag the checklist line, or restore the test's name and its @project tag." >&2
  echo "Projects read from playwright.config.ts: $(echo $projects | tr '\n' ' ')" >&2
else
  echo "OK: $checked checklist (e2e:) tags resolve to a test that exists and runs"
fi

exit $fail
