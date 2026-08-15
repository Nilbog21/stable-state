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
# Function bodies are excluded from matching (see `strip_body`) and SQL keywords are matched
# case-insensitively. Both are fail-open fixes, not polish: without them a `RETURNS trigger` or a
# REVOKE-shaped line inside a `RAISE NOTICE`, or lowercase DDL, makes the gate report OK on a
# function it never guarded.

# SQL keywords are case-insensitive, so every `=~` and `case` below is too. Function names are
# folded to lower case at capture so a mixed-case CREATE and a lowercase REVOKE share a key.
shopt -s nocasematch

declare -A reset_at reset_loc revoke_at is_trigger

seq=0
pending=''
in_body=''

# Sets `code` to the line with dollar-quoted body text removed, carrying `$$` depth across lines
# via `in_body`. A body-only line yields ''; the `$$ LANGUAGE plpgsql;` closer yields its tail, so
# the trigger window below still ends where it should.
# ponytail: bare `$$` only — no migration in the set uses a tagged `$tag$` quote. Track the tag
# too if one ever appears.
strip_body() {
  local rest="$1"
  code=''
  while [ -n "$rest" ]; do
    if [ -z "$in_body" ]; then
      case "$rest" in
        *'$$'*)
          code+="${rest%%'$$'*}"
          rest="${rest#*'$$'}"
          in_body=1
          ;;
        *)
          code+="$rest"
          rest=''
          ;;
      esac
    else
      case "$rest" in
        *'$$'*)
          rest="${rest#*'$$'}"
          in_body=''
          ;;
        *) rest='' ;;
      esac
    fi
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
  pending=''
  in_body=''
done

fail=0
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
