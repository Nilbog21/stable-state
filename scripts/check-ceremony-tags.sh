#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Fails if a `RELEASE_CEREMONY.md` checkbox does not carry exactly one of `(auto)`, `(prompt)` or
# `(manual)`. #1542. `/releaseCeremony` reads those tags to decide what it may do unattended, so an
# untagged checkbox is not a cosmetic gap — the skill refuses to start on one, and the failure
# arrives weeks into a release ceremony rather than in the PR that added the line.
#
# Fail-closed throughout, on the same reasoning as check-e2e-tags.sh: an unknown tag, two tags, a
# missing file and a parse that collected nothing are each a FAIL rather than a silent OK. A gate
# landing green while enforcing less than the prose beside it claims is worse than no gate.
#
# The tag is the checkbox's **opener** — the first token after `- [ ] `. Counting tag words
# line-wide would fail a checkbox whose prose legitimately names another tag, which the header
# convention blockquote and several steps do.
#
# Checkboxes under `Acceptance criteria to paste into that issue:` are exempt: they are text
# destined for a GitHub issue body, not ceremony steps. The exemption ends at the next `### `
# heading or `---` divider — both, because Part 1's last acceptance-criteria block is followed by a
# divider and a `## ` heading rather than a `###`, so a `###`-only rule would carry the exemption
# across the part boundary.

FILE='RELEASE_CEREMONY.md'
AC_LEAD='Acceptance criteria to paste into that issue:'

if [ ! -f "$FILE" ]; then
  echo "FAIL: $FILE not found — this gate reads the release ceremony runbook at the repo root" >&2
  exit 1
fi

fail=0
checked=0
in_ac=0
lineno=0

# `|| [ -n "$line" ]` because `read` returns non-zero on a final line with no trailing newline;
# testing its status alone drops that line — fail-open, and invisible to every fixture, since the
# test harness writes them with a trailing newline. Same shape as check-pipefail-race.sh.
while IFS= read -r line || [ -n "$line" ]; do
  lineno=$((lineno + 1))

  if [ "$line" = "$AC_LEAD" ]; then
    in_ac=1
    continue
  fi
  case "$line" in
    '### '* | '---') in_ac=0 ;;
  esac

  # The three literal box spellings rather than a `- [?] ` strip: `[?]` is a bracket expression
  # matching a literal `?`, not a single-char wildcard, so that strip silently no-ops and every
  # checkbox reads as untagged.
  case "$line" in
    '- [ ] '* | '- [x] '* | '- [X] '*) ;;
    *) continue ;;
  esac
  [ "$in_ac" -eq 1 ] && continue

  checked=$((checked + 1))
  opener="${line:6}"
  case "$opener" in
    '(auto) '* | '(prompt) '* | '(manual) '*) ;;
    *)
      echo "FAIL: $FILE:$lineno — checkbox carries no single (auto)/(prompt)/(manual) tag: $line" >&2
      fail=1
      continue
      ;;
  esac
  # Exactly one: strip the opener's tag and reject a second one immediately behind it.
  rest="${opener#(*) }"
  case "$rest" in
    '(auto) '* | '(prompt) '* | '(manual) '*)
      echo "FAIL: $FILE:$lineno — checkbox carries two tags, not one: $line" >&2
      fail=1
      ;;
  esac
done < "$FILE"

if [ "$checked" -eq 0 ]; then
  echo "FAIL: $FILE — no ceremony checkboxes found. A parse that collected nothing clears every" >&2
  echo "      check and prints the same OK as a fully tagged file, so it fails instead." >&2
  exit 1
fi

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "Every $FILE checkbox carries exactly one of (auto), (prompt) or (manual), stated" >&2
  echo "immediately after the box. The tag answers \"can Claude satisfy or verify this without" >&2
  echo "me?\" — not \"who does the work?\". See that file's Automation tags convention." >&2
  echo "Checkboxes under \"$AC_LEAD\" are exempt — they belong to a GitHub issue body." >&2
  exit 1
fi

echo "OK: $checked $FILE checkboxes each carry exactly one (auto)/(prompt)/(manual) tag"
