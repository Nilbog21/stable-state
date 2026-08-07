#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Fails if a checklist line tagged `(e2e: <test name>)` names a Playwright test that does not
# exist, or one that exists but can never run. `/runChecklist` Step 0.5 maps a green suite run
# onto every `(e2e:)` checkbox; neither direction of that claim was verified, so a rename in an
# unrelated PR would launder an unverified checkbox into "green run — every (e2e:) checkbox
# passed" months later. Same drift class `select-specs.sh --lint` catches for `covers:` globs.
#
# Four checks, all over *tags*:
#   orphan         — the tag matches no test title in e2e/*.spec.ts
#   never-executes — the tag's test carries no Playwright project tag, so no project greps it in
#   wrong-role     — the tag's test runs only as identities the phase doesn't assert as (#1392)
#   malformed      — the tag doesn't parse, so none of the checks above can be run on it
#
# The reverse direction is deliberately not linted: a test claimed by no checklist line is
# legitimate (5 today), so flagging it would buy busywork. See docs/scripts.md.

# The files whose (e2e:) tags are data rather than prose. PRE_RELEASE_TEST_CHECKLIST.md is
# excluded: all 4 of its `(e2e:` hits are convention prose (`<test name>`, `…`).
# POST_RELEASE_TEST_CHECKLIST.md joins this list if/when POST gains (e2e:) tags — it is its own
# index, so its prose would need the same placeholder consideration first.
# A glob rather than the seven filenames: a literal list is fail-open in this gate's own failure
# class, since a phase file added later would be silently unlinted and say so nowhere.
CHECKLIST_GLOBS=('checklists/pre-release/*.md')

# The valid asserting-role tokens. `role-agnostic` means unconstrained, and exists for phase 1
# alone — it genuinely has no single walker (an unauthenticated visitor, then the demo user, then
# the developer's own account). Phase 4's comment also contains the words "role-agnostic", about
# the *assertion's* nature rather than the identity walking the phase; admitting it as a token
# there would exempt 560 of the 733 tags, so phase 4's head is `manager` alone.
VALID_ROLE_TOKENS='manager trainer rider role-agnostic'

# The projects, read from playwright.config.ts rather than restated here — a restated list drifts,
# and the drift is silent in the direction that matters. Each project collects tests by
# `grep: /@name/`, so a title matching none of them is collected by nothing; each also binds one
# `storageState`, which is the *identity* its tests run as. Read per line so the two stay paired.
#
# The role comes from storageState and not from the project's name because they are not the same
# thing: `mobile` is a viewport project running manager.json, and phase 4 legitimately carries a
# @mobile tag. A phase-name-to-project-name rule false-positives on it immediately.
declare -A role_of_project
projects=""
while IFS= read -r config_line; do
  [[ "$config_line" =~ grep:\ /@([A-Za-z0-9_]+)/ ]] || continue
  project="${BASH_REMATCH[1]}"
  projects="$projects $project"
  if [[ "$config_line" =~ storageState:\ \'e2e/\.auth/([A-Za-z0-9_-]+)\.json\' ]]; then
    role_of_project["$project"]="${BASH_REMATCH[1]}"
  else
    echo "FAIL: playwright.config.ts: project '@$project' has no parseable storageState" >&2
    echo "The wrong-role check resolves a project to the identity it runs as through that path." >&2
    echo "A project silently mapped to no role fails every tag naming it, for a reason the config" >&2
    echo "rather than the checklist owns. Aborting rather than reporting it as checklist drift." >&2
    exit 1
  fi
done < playwright.config.ts

if [ -z "$projects" ]; then
  echo "FAIL: no projects parsed out of playwright.config.ts" >&2
  echo "The never-executes check needs them; a run that resolved none would clear every tag and" >&2
  echo "print the same OK as a clean tree. Aborting rather than passing vacuously." >&2
  exit 1
fi

# Does this title carry a tag some configured project greps for?
runs_under_a_project() {
  local title="$1" project
  for project in $projects; do
    case "$title" in *"@$project"*) return 0 ;; esac
  done
  return 1
}

# The identities this title's project tags run it as — deduplicated, since two projects can share
# one storageState (`manager` and `mobile` do).
roles_of_title() {
  local title="$1" project role out=""
  for project in $projects; do
    case "$title" in *"@$project"*) ;; *) continue ;; esac
    role="${role_of_project[$project]}"
    case " $out " in *" $role "*) ;; *) out="$out $role" ;; esac
  done
  echo "${out# }"
}

# Does this title run as at least one of the identities the phase declares it asserts as?
asserts_as_declared_role() {
  local title="$1" allowed="$2" role
  case " $allowed " in *" role-agnostic "*) return 0 ;; esac
  for role in $(roles_of_title "$title"); do
    case " $allowed " in *" $role "*) return 0 ;; esac
  done
  return 1
}

# Test titles, keyed by title-with-project-suffixes-stripped, valued by the full title. Only
# `test('…')` — the 5 `test(`…`)` template-literal sites can't be resolved statically, and 4 of
# them would be permanent false positives on the never-executes check, their project tag being
# `@${role}`. A checklist tag naming a *generated* title would therefore read as an orphan;
# none does today, and the generated names aren't checklist-shaped (see docs/scripts.md).
declare -A title_of
while IFS= read -r title; do
  stripped="$title"
  # Strip every trailing ` @suffix` — a title may carry several (`… @trainer @rider`), and
  # checklist tags carry none at all (0 of 713 today).
  while [[ "$stripped" =~ ^(.*)\ @[A-Za-z0-9_]+$ ]]; do
    stripped="${BASH_REMATCH[1]}"
  done
  # Two declarations can strip to the same key. Last-wins would make the verdict depend on
  # declaration order — a project-tagged one masking a bare sibling that never runs, or the
  # reverse — so keep whichever *fails* the never-executes check. The tag can't say which test
  # it meant, and fail-closed is this gate's polarity.
  if [ -n "${title_of[$stripped]+set}" ] && ! runs_under_a_project "${title_of[$stripped]}"; then
    continue
  fi
  title_of["$stripped"]="$title"
done < <(grep -ohE "^[[:space:]]*test\('[^']*'" e2e/*.spec.ts | sed -E "s|^[[:space:]]*test\('||; s|'$||")

fail=0
checked=0
for glob in "${CHECKLIST_GLOBS[@]}"; do
  for f in $glob; do
    # An unmatched glob expands to itself, which is not a file.
    [ -f "$f" ] || continue

    # The identities this phase is walked by, from its own declaration. Grammar is
    # `<!-- Asserting role: <roles> — <free prose> -->`: only the head, before the *first* ` — `,
    # is parsed, and it is split on `, `. Prose-grepping the whole comment would be fail-open in
    # this gate's own failure class — phase 4's prose contains "trainer" and "rider", phase 5's
    # contains "manager", and phase 1's sentence ends "…and as its manager", so a comment-wide
    # grep resolves every phase to every role and reports the tree clean forever.
    #
    # A declaration that exists is parsed wherever it sits, tags or no tags: a typo in a phase
    # file that has none yet would otherwise lie dormant until the unrelated PR that adds its
    # first tag. Only the *requirement* that one exist is scoped to files carrying tags.
    declarations="$(grep '<!-- Asserting role:' "$f" || true)"
    declaration_count="$(grep -c . <<<"$declarations" || true)"
    allowed_roles=""
    role_check_ok=1
    if [ "$declaration_count" -gt 1 ]; then
      echo "FAIL: $f: $declaration_count \`Asserting role:\` comments — the phase's asserting" >&2
      echo "      role is ambiguous, and neither last-wins nor union is defensible" >&2
      fail=1
      role_check_ok=0
    elif [ "$declaration_count" -eq 1 ]; then
      role_head="${declarations#*<!-- Asserting role:}"
      role_head="${role_head%-->}"
      role_head="${role_head%% — *}"
      role_head="${role_head#"${role_head%%[![:space:]]*}"}"
      role_head="${role_head%"${role_head##*[![:space:]]}"}"
      read -ra role_tokens <<<"${role_head//,/ }"
      # Both emptinesses are the same failure and are checked together: `` trips the first, `,`
      # only the second — it is not the empty string, so it clears a `-z` guard, but it splits to
      # zero tokens, and a zero-length token list runs the unknown-token loop zero times. Left to
      # the loop alone, punctuation is a declaration constraining nothing.
      if [ -z "$role_head" ] || [ "${#role_tokens[@]}" -eq 0 ]; then
        echo "FAIL: $f: unparseable \`Asserting role:\` head — expected" >&2
        echo "      \`<!-- Asserting role: <roles> — <free prose> -->\`" >&2
        fail=1
        role_check_ok=0
      else
        for token in "${role_tokens[@]}"; do
          case " $VALID_ROLE_TOKENS " in
            *" $token "*) ;;
            *)
              echo "FAIL: $f: unknown asserting-role token '$token' — expected one or more of:" >&2
              echo "      $VALID_ROLE_TOKENS" >&2
              fail=1
              role_check_ok=0
              ;;
          esac
        done
        if [ "$role_check_ok" -eq 1 ]; then
          allowed_roles="${role_tokens[*]}"
        fi
      fi
    elif grep -q '(e2e:' "$f"; then
      echo "FAIL: $f: carries (e2e:) tags but no \`Asserting role:\` comment" >&2
      echo "      Falling back to unconstrained would silently exempt a phase file from the" >&2
      echo "      wrong-role check while reporting the same OK as a declared one." >&2
      fail=1
      role_check_ok=0
    fi

    n=0
    # `|| [ -n "$line" ]` catches a final line with no trailing newline — `read` fills `$line`
    # but returns non-zero, so testing its status alone silently drops that line.
    while IFS= read -r line || [ -n "$line" ]; do
      n=$((n + 1))
      # Guard on `(e2e:` rather than `(e2e: ` so a tag missing its space is seen as a malformed
      # tag below rather than as not-a-tag. `(e2e-candidate)` doesn't contain the colon.
      [[ "$line" == *"(e2e:"* ]] || continue

      # How many tags the line claims to carry, counted before parsing: a malformed one — no
      # closing paren, no space after the colon — matches this but not the regex below, and
      # would otherwise be dropped silently. That is this gate's own failure class arriving
      # through a typo, so the count is compared against `parsed` once the loop finishes.
      claimed=0
      tmp="$line"
      while [[ "$tmp" == *"(e2e:"* ]]; do
        claimed=$((claimed + 1))
        tmp="${tmp#*"(e2e:"}"
      done

      # A line may carry more than one tag; take each.
      parsed=0
      rest="$line"
      while [[ "$rest" =~ \(e2e:\ ([^\)]*)\)(.*)$ ]]; do
        tag="${BASH_REMATCH[1]}"
        rest="${BASH_REMATCH[2]}"
        parsed=$((parsed + 1))
        checked=$((checked + 1))
        if [ -z "${title_of[$tag]+set}" ]; then
          echo "FAIL: $f:$n: (e2e: $tag) — no test with this title exists in e2e/*.spec.ts" >&2
          fail=1
        elif ! runs_under_a_project "${title_of[$tag]}"; then
          echo "FAIL: $f:$n: (e2e: $tag) — its test carries no project tag, so it never runs" >&2
          fail=1
        elif [ "$role_check_ok" -eq 1 ] && \
          ! asserts_as_declared_role "${title_of[$tag]}" "$allowed_roles"; then
          echo "FAIL: $f:$n: (e2e: $tag) — its test runs as" \
            "$(roles_of_title "${title_of[$tag]}"), but this phase asserts as $allowed_roles" >&2
          fail=1
        fi
      done
      if [ "$parsed" -lt "$claimed" ]; then
        echo "FAIL: $f:$n: malformed (e2e:) tag — expected \`(e2e: <test name>)\`" >&2
        fail=1
      fi
    done < "$f"
  done
done

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "A checklist (e2e:) tag naming a test that doesn't exist, one no Playwright project" >&2
  echo "collects, or one that runs only as an identity this phase is never walked by, is marked" >&2
  echo "verified by a green suite run without anything having asserted it. Retag the checklist" >&2
  echo "line, restore the test's name and its @project tag, or move the line to the phase whose" >&2
  echo "asserting role matches — a line asserting trainer-visible UI can only ever be covered by" >&2
  echo "a trainer-eye test, per PRE_RELEASE_TEST_CHECKLIST.md's phase-partitioning Convention." >&2
  echo "Projects read from playwright.config.ts:$(for p in $projects; do
    printf ' @%s(%s)' "$p" "${role_of_project[$p]}"
  done)" >&2
else
  echo "OK: $checked checklist (e2e:) tags resolve to a test that exists, runs, and runs as an" \
    "identity its phase asserts as"
fi

exit $fail
