#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Fails if a function in supabase/migrations/ is left with Postgres' default `EXECUTE` for
# `PUBLIC`, which PostgREST exposes to an anon-key caller. The rule is:
#
#   a `REVOKE … ON FUNCTION <name> … FROM PUBLIC` exists **at or after** that function's last
#   plain `CREATE FUNCTION` or `DROP FUNCTION`, in filename-then-line order across the set.
#
# Two things make it a real gate rather than theatre:
#
# 1. **Ordering, not mere existence.** A bare "a REVOKE exists somewhere" check passes
#    20260731081403_appointment_functions.sql, which DROPs and recreates create_expense_with_horses
#    — discarding its ACL — and only re-grants because someone remembered. That is the exact
#    failure #972's squash shipped (it dropped set_instructor_cut's pair; #1158 restored it).
# 2. **`CREATE OR REPLACE` does not restart the clock.** It preserves the existing ACL, so
#    treating it as a reset would false-fail every body-only amendment in the live set —
#    20260807132021_update_horse_notes_admits_manager.sql's header says exactly this. Only a plain
#    CREATE (which errors on an existing function, so it only ever follows a DROP or nothing) and
#    a DROP reset it.
#
# `RETURNS trigger` functions are exempt: not PostgREST-reachable, and Postgres checks `EXECUTE` on
# a trigger function at `CREATE TRIGGER` time rather than at fire time.
#
# Tracking is by function *name*, not signature. Signature parsing buys nothing here — an overload
# set shares one ACL story in this repo, and a REVOKE naming any arity of a name is a REVOKE
# someone wrote deliberately. The cost is that a genuinely divergent overload pair would read as
# guarded; there are none, and `Verify Migrations` replays the SQL either way.
#
# This checks the **replay** property — what a from-scratch migration run produces — which is
# precisely what broke. A live pg_proc.proacl assertion would check the accumulated dev/prod state
# instead, and needs a database in CI.
#
# Only text Postgres would read as DDL is matched: `strip_body` removes dollar-quoted bodies,
# `/* */` block comments, `--` line comments and string literals, and SQL keywords are matched
# case-insensitively. Both are fail-open fixes, not polish: without them a `RETURNS trigger` or a
# REVOKE-shaped line inside a `RAISE NOTICE` or a `/* … */` note, or lowercase DDL, makes the gate
# report OK on a function it never guarded.

# SQL keywords are case-insensitive, so every `=~` and `case` below is too. Function names are
# folded to lower case at capture so a mixed-case CREATE and a lowercase REVOKE share a key.
# The one thing this must *not* fold is a dollar-quote tag, which Postgres compares
# case-sensitively — see the `body` branch, which uses parameter expansion for exactly that reason.
shopt -s nocasematch

declare -A reset_at reset_loc revoke_at is_trigger

seq=0
pending=''
state=''
tag=''
estr=''
fail=0

# The leftmost of these four starts something that is not DDL. POSIX EREs are leftmost-longest, so
# the match *is* the first one — no separate "which comes first" comparison.
tok_re='(--|/\*|'\''|\$[a-zA-Z_0-9]*\$)'

# Sets `code` to the line with everything Postgres would not read as DDL removed: dollar-quoted
# bodies, `/* */` block comments, `--` line comments, and single-quoted strings. `state` and `tag`
# carry across lines, since bodies, block comments and strings can all span them — a `--` comment
# ends at the newline, so it alone clears the rest of the line without setting `state`. A body-only
# line yields ''; the
# `$$ LANGUAGE plpgsql;` closer yields its tail, so the trigger window below still ends where it
# should.
#
# This is a scanner rather than a "count the `$$`s" parity toggle because parity has no notion of
# whether an occurrence is a delimiter: one `$$` in a comment or a string literal flips it for
# every remaining line of the file, and the CREATEs after it are never entered into the set at all.
# ponytail: block comments don't nest, though Postgres nests them — an inner `*/` ends the comment
# and the leftover text is scanned as code. Add a depth counter if a migration ever nests one.
strip_body() {
  local rest="$1" tok pre bs after
  code=''
  while [ -n "$rest" ]; do
    case "$state" in
      body)
        # A body ends only on its own opening delimiter, and dollar-quote tags are case-sensitive
        # in Postgres — so this is the one comparison in the scanner that must not be folded.
        # `nocasematch` governs `case` and `[[` but *not* parameter expansion, which is why this
        # branch is an expansion where its three siblings are `case`. `$tag` is never empty (the
        # token regex requires at least `$$`), so a match always shortens the string and an
        # unchanged result reliably means "not found".
        after="${rest#*"$tag"}"
        if [ "$after" != "$rest" ]; then rest="$after"; state=''; else rest=''; fi
        ;;
      comment)
        case "$rest" in
          *'*/'*) rest="${rest#*'*/'}"; state='' ;;
          *) rest='' ;;
        esac
        ;;
      string)
        case "$rest" in
          *"'"*)
            pre="${rest%%\'*}"
            rest="${rest#*\'}"
            # Only an E'…' literal treats `\` as an escape (`standard_conforming_strings` is on),
            # and there an *odd* run of backslashes escapes the quote — an even run is escaped
            # backslashes, and the quote after them still closes.
            bs="${pre##*[!\\]}"
            if [ -n "$estr" ] && [ $(( ${#bs} % 2 )) -eq 1 ]; then continue; fi
            # `''` is an escaped quote — the string continues past it. Behaviour-preserving to
            # delete (the second quote sits at position 0, so the code-state scan would re-enter
            # string state with identical `rest` and `code`), kept so `estr` survives a `''`
            # structurally rather than by that coincidence.
            case "$rest" in "'"*) rest="${rest#\'}" ;; *) state=''; estr='' ;; esac
            ;;
          *) rest='' ;;
        esac
        ;;
      *)
        if [[ "$rest" =~ $tok_re ]]; then
          tok="${BASH_REMATCH[1]}"
          code+="${rest%%"$tok"*}"
          rest="${rest#*"$tok"}"
          case "$tok" in
            '--') rest='' ;;
            '/*') state=comment ;;
            # `code` ends at the character before the quote, so its tail is the E prefix test.
            "'") state=string; estr=''
                 if [[ "$code" =~ (^|[^a-zA-Z0-9_])e$ ]]; then estr=1; fi ;;
            *) state=body; tag="$tok" ;;
          esac
        else
          code+="$rest"
          rest=''
        fi
        ;;
    esac
  done
}

for f in supabase/migrations/*.sql; do
  n=0
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    seq=$((seq + 1))

    strip_body "$line"

    # A signature can span lines, so `RETURNS trigger` is looked for from the CREATE line until
    # the LANGUAGE clause that always follows it. Both spellings live in the set: the baseline
    # puts RETURNS on the CREATE line, later migrations give it its own.
    if [ -n "$pending" ]; then
      if [[ "$code" =~ RETURNS[[:space:]]+TRIGGER ]]; then
        is_trigger[$pending]=1
      fi
      case "$code" in *LANGUAGE*) pending='' ;; esac
    fi

    if [[ "$code" =~ ^[[:space:]]*CREATE[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?FUNCTION[[:space:]]+(public\.)?([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
      # Captured before the next `=~`, which overwrites BASH_REMATCH.
      name="${BASH_REMATCH[3],,}"
      or_replace="${BASH_REMATCH[1]:-}"
      pending="$name"
      if [[ "$code" =~ RETURNS[[:space:]]+TRIGGER ]]; then
        is_trigger[$name]=1
      fi
      # An OR REPLACE preserves the ACL — record the name so a never-revoked function still
      # reports, but leave any existing reset point alone.
      if [ -z "$or_replace" ] || [ -z "${reset_at[$name]:-}" ]; then
        reset_at[$name]=$seq
        reset_loc[$name]="$f:$n"
      fi
      continue
    fi

    if [[ "$code" =~ ^[[:space:]]*DROP[[:space:]]+FUNCTION[[:space:]]+(IF[[:space:]]+EXISTS[[:space:]]+)?(public\.)?([a-zA-Z_][a-zA-Z0-9_]*) ]]; then
      name="${BASH_REMATCH[3],,}"
      reset_at[$name]=$seq
      reset_loc[$name]="$f:$n"
      continue
    fi

    if [[ "$code" =~ ^[[:space:]]*REVOKE[[:space:]].*ON[[:space:]]+FUNCTION[[:space:]]+(public\.)?([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*\(.*FROM[[:space:]]+PUBLIC ]]; then
      revoke_at[${BASH_REMATCH[2],,}]=$seq
    fi
  done < "$f"
  # Still inside something at EOF means the scan lost track, and every verdict drawn from this file
  # is unreliable — the same fail-open shape the scanner exists to close, so report it rather than
  # silently mis-scan.
  if [ -n "$state" ]; then
    echo "FAIL: $f: reached end of file still inside a $state — this file was not fully scanned" >&2
    fail=1
  fi
  pending=''
  state=''
done

for name in $(printf '%s\n' "${!reset_at[@]}" | sort); do
  [ -n "${is_trigger[$name]:-}" ] && continue
  if [ "${revoke_at[$name]:-0}" -lt "${reset_at[$name]}" ]; then
    echo "FAIL: ${reset_loc[$name]}: $name has no REVOKE … FROM PUBLIC at or after this statement" >&2
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "A function created (or dropped and recreated) without a following" >&2
  echo "'REVOKE ALL ON FUNCTION <sig> FROM PUBLIC;' keeps Postgres' default PUBLIC EXECUTE on a" >&2
  echo "from-scratch replay, making it callable with the anon key via PostgREST. Add the REVOKE" >&2
  echo "and the matching GRANT to authenticated (plus service_role if a script reaches it)." >&2
  echo "See docs/architecture/rls.md." >&2
else
  echo "OK: every non-trigger function in supabase/migrations/ is revoked from PUBLIC after its last create"
fi

exit $fail
