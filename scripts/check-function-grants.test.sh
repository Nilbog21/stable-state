#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/check-function-grants.sh"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# Creates a temp git repo holding supabase/migrations/<name> files. Args are name/body pairs;
# order matters, since the rule under test is about statement order across the migration set.
make_repo() {
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/supabase/migrations"
  while [ "$#" -gt 0 ]; do
    printf '%s\n' "$2" > "$dir/supabase/migrations/$1"
    shift 2
  done
  echo "$dir"
}

# Runs the script in a fixture repo; sets $script_exit and $script_output.
run_in() {
  script_output="$(cd "$1" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
}

# Test 1: CREATE followed by REVOKE — the shape every guarded function has
REPO="$(make_repo 20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
REVOKE ALL ON FUNCTION public.do_thing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.do_thing(uuid) TO authenticated;")"
run_in "$REPO"
if [ "$script_exit" -eq 0 ]; then
  assert_pass "CREATE then REVOKE FROM PUBLIC: exits 0"
else
  assert_fail "CREATE then REVOKE FROM PUBLIC: exits 0" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 2: no REVOKE anywhere — the class this issue closes. Must name the function.
REPO="$(make_repo 20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
GRANT EXECUTE ON FUNCTION public.do_thing(uuid) TO authenticated;")"
run_in "$REPO"
if [ "$script_exit" -ne 0 ] && printf '%s' "$script_output" | grep -q 'do_thing'; then
  assert_pass "CREATE with no REVOKE: exits non-zero, names the function"
else
  assert_fail "CREATE with no REVOKE: exits non-zero, names the function" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 3: the ordering case. A later DROP+CREATE discards the ACL the earlier REVOKE set, so a
# bare "a REVOKE exists somewhere" check passes this and the function is PUBLIC-executable again.
REPO="$(make_repo \
  20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
REVOKE ALL ON FUNCTION public.do_thing(uuid) FROM PUBLIC;" \
  20260102000001_fn_v2.sql "DROP FUNCTION public.do_thing(uuid);
CREATE FUNCTION public.do_thing(p_id uuid, p_extra text) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
GRANT EXECUTE ON FUNCTION public.do_thing(uuid, text) TO authenticated;")"
run_in "$REPO"
if [ "$script_exit" -ne 0 ] && printf '%s' "$script_output" | grep -q '20260102000001_fn_v2.sql'; then
  assert_pass "REVOKE then DROP+CREATE: exits non-zero, names the recreating migration"
else
  assert_fail "REVOKE then DROP+CREATE: exits non-zero, names the recreating migration" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 4: the same DROP+CREATE, re-revoked. Proves test 3 fails for the ordering and not merely
# for containing a DROP.
REPO="$(make_repo \
  20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
REVOKE ALL ON FUNCTION public.do_thing(uuid) FROM PUBLIC;" \
  20260102000001_fn_v2.sql "DROP FUNCTION public.do_thing(uuid);
CREATE FUNCTION public.do_thing(p_id uuid, p_extra text) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
REVOKE ALL ON FUNCTION public.do_thing(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.do_thing(uuid, text) TO authenticated;")"
run_in "$REPO"
if [ "$script_exit" -eq 0 ]; then
  assert_pass "DROP+CREATE then re-REVOKE: exits 0"
else
  assert_fail "DROP+CREATE then re-REVOKE: exits 0" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Tests 5-6: a trigger function is exempt — not PostgREST-reachable, and Postgres checks EXECUTE
# at CREATE TRIGGER time rather than at fire time. Both spellings, since the baseline puts
# `RETURNS trigger` on the CREATE line and later migrations put it on its own.
for body in "CREATE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS \$\$ BEGIN RETURN NEW; END; \$\$;" \
  "CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS \$\$ BEGIN RETURN NEW; END; \$\$;"; do
  REPO="$(make_repo 20260101000001_fn.sql "$body")"
  run_in "$REPO"
  if [ "$script_exit" -eq 0 ]; then
    assert_pass "RETURNS trigger with no REVOKE: exits 0"
  else
    assert_fail "RETURNS trigger with no REVOKE: exits 0" "exit=$script_exit output=$script_output"
  fi
  rm -rf "$REPO"
done

# Test 7: CREATE OR REPLACE preserves the ACL, so it must not restart the clock. Counting it as a
# reset would false-fail every body-only amendment in the live set — 20260807132021's header says
# exactly this. Fail-closed on a real reset is the point; fail-closed on a no-op is noise.
REPO="$(make_repo \
  20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
REVOKE ALL ON FUNCTION public.do_thing(uuid) FROM PUBLIC;" \
  20260102000001_fn_body.sql "CREATE OR REPLACE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN RAISE NOTICE 'changed'; END; \$\$;")"
run_in "$REPO"
if [ "$script_exit" -eq 0 ]; then
  assert_pass "CREATE OR REPLACE after a REVOKE: exits 0"
else
  assert_fail "CREATE OR REPLACE after a REVOKE: exits 0" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 8: a function whose only statement is CREATE OR REPLACE, never revoked, still fails —
# guards test 7's exemption against widening into "any OR REPLACE launders the function".
REPO="$(make_repo 20260101000001_fn.sql "CREATE OR REPLACE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;")"
run_in "$REPO"
if [ "$script_exit" -ne 0 ] && printf '%s' "$script_output" | grep -q 'do_thing'; then
  assert_pass "CREATE OR REPLACE with no REVOKE ever: exits non-zero"
else
  assert_fail "CREATE OR REPLACE with no REVOKE ever: exits non-zero" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 9: DROP FUNCTION IF EXISTS is the spelling 20260731081403_appointment_functions.sql uses.
# Missing it would read that file's recreations as unguarded-clock-untouched — fail-open.
REPO="$(make_repo \
  20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
REVOKE ALL ON FUNCTION public.do_thing(uuid) FROM PUBLIC;" \
  20260102000001_fn_v2.sql "DROP FUNCTION IF EXISTS public.do_thing(uuid);
CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;")"
run_in "$REPO"
if [ "$script_exit" -ne 0 ] && printf '%s' "$script_output" | grep -q '20260102000001_fn_v2.sql'; then
  assert_pass "DROP FUNCTION IF EXISTS resets the clock: exits non-zero"
else
  assert_fail "DROP FUNCTION IF EXISTS resets the clock: exits non-zero" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 10: REVOKE EXECUTE and an unqualified name are both live spellings in the migration set
# (20260729032550 and 20260716005944 respectively). Neither may read as "no REVOKE".
REPO="$(make_repo 20260101000001_fn.sql "CREATE FUNCTION do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
REVOKE EXECUTE ON FUNCTION do_thing(uuid) FROM PUBLIC;")"
run_in "$REPO"
if [ "$script_exit" -eq 0 ]; then
  assert_pass "REVOKE EXECUTE, unqualified name: exits 0"
else
  assert_fail "REVOKE EXECUTE, unqualified name: exits 0" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 11: a REVOKE naming a *different* function must not clear this one. Substring matching on
# the name is the obvious cheap implementation and this is where it fails open.
REPO="$(make_repo 20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
REVOKE ALL ON FUNCTION public.do_thing_else(uuid) FROM PUBLIC;")"
run_in "$REPO"
if [ "$script_exit" -ne 0 ] && printf '%s' "$script_output" | grep -q 'do_thing'; then
  assert_pass "REVOKE on a name this one is a prefix of: exits non-zero"
else
  assert_fail "REVOKE on a name this one is a prefix of: exits non-zero" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 12: `returns trigger` appearing in a function *body* must not exempt the function. The
# trigger-detection window runs from the CREATE line until a line containing LANGUAGE, and in the
# `AS $$ … $$ LANGUAGE plpgsql;` spelling that is the last line — so the whole body is in the
# window unless dollar-quoted text is excluded from matching.
REPO="$(make_repo 20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
AS \$\$
BEGIN
  RAISE NOTICE 'the audit hook returns trigger rows';
END;
\$\$ LANGUAGE plpgsql;")"
run_in "$REPO"
if [ "$script_exit" -ne 0 ] && printf '%s' "$script_output" | grep -q 'do_thing'; then
  assert_pass "'returns trigger' inside a body does not exempt: exits non-zero"
else
  assert_fail "'returns trigger' inside a body does not exempt: exits non-zero" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 13: a REVOKE-shaped line inside a dollar-quoted string is text, not DDL. A multi-line
# RAISE NOTICE puts one at column 0, which is exactly what the line-anchored REVOKE detector reads
# as a real revoke — the function ships PUBLIC-executable and the gate says OK.
REPO="$(make_repo 20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
AS \$\$
BEGIN
  RAISE NOTICE 'to lock this down, run:
REVOKE ALL ON FUNCTION public.do_thing(uuid) FROM PUBLIC;';
END;
\$\$ LANGUAGE plpgsql;")"
run_in "$REPO"
if [ "$script_exit" -ne 0 ] && printf '%s' "$script_output" | grep -q 'do_thing'; then
  assert_pass "REVOKE-shaped line inside a body is not a revoke: exits non-zero"
else
  assert_fail "REVOKE-shaped line inside a body is not a revoke: exits non-zero" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 14: SQL keywords are case-insensitive. Lowercase DDL must still be tracked — a
# case-sensitive detector never enters the function into the set at all, so it is not merely
# unguarded, it is unchecked, and the gate reports OK.
REPO="$(make_repo 20260101000001_fn.sql "create or replace function public.do_thing(p_id uuid) returns void
language plpgsql as \$\$ BEGIN END; \$\$;")"
run_in "$REPO"
if [ "$script_exit" -ne 0 ] && printf '%s' "$script_output" | grep -q 'do_thing'; then
  assert_pass "lowercase CREATE with no revoke: exits non-zero"
else
  assert_fail "lowercase CREATE with no revoke: exits non-zero" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 15: the other half of test 14 — a lowercase revoke must clear a lowercase create. Without
# this, "lowercase always fails" would pass test 14 while being a fail-closed bug of its own.
REPO="$(make_repo 20260101000001_fn.sql "create function public.do_thing(p_id uuid) returns void
language plpgsql as \$\$ BEGIN END; \$\$;
revoke all on function public.do_thing(uuid) from public;
grant execute on function public.do_thing(uuid) to authenticated;")"
run_in "$REPO"
if [ "$script_exit" -eq 0 ]; then
  assert_pass "lowercase CREATE then lowercase revoke: exits 0"
else
  assert_fail "lowercase CREATE then lowercase revoke: exits 0" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 16: a `$$` inside a line comment is text, not a delimiter. Parity-toggling on every `$$`
# substring opens a body that never closes, so every later line strips to '' and the CREATE below
# is never entered into the set at all — unchecked rather than unguarded, and the gate says OK.
REPO="$(make_repo 20260101000001_fn.sql "-- the \$\$ delimiter below opens the body
CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;")"
run_in "$REPO"
if [ "$script_exit" -ne 0 ] && printf '%s' "$script_output" | grep -q 'do_thing'; then
  assert_pass "'\$\$' inside a line comment does not open a body: exits non-zero"
else
  assert_fail "'\$\$' inside a line comment does not open a body: exits non-zero" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 17: the same poisoning through a string literal. Same consequence as test 16, different
# construct — a `$$` in quoted text must not open a body either.
REPO="$(make_repo 20260101000001_fn.sql "COMMENT ON TABLE public.lessons IS 'the price is \$\$5 per lesson';
CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;")"
run_in "$REPO"
if [ "$script_exit" -ne 0 ] && printf '%s' "$script_output" | grep -q 'do_thing'; then
  assert_pass "'\$\$' inside a string literal does not open a body: exits non-zero"
else
  assert_fail "'\$\$' inside a string literal does not open a body: exits non-zero" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 18: test 13's failure mode one comment syntax over — a REVOKE inside a /* … */ block is a
# note about a revoke, not a revoke. Not hypothetical: /* */ is live in three migrations, this
# issue's own included.
REPO="$(make_repo 20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
/* still to do before this ships:
REVOKE ALL ON FUNCTION public.do_thing(uuid) FROM PUBLIC;
*/")"
run_in "$REPO"
if [ "$script_exit" -ne 0 ] && printf '%s' "$script_output" | grep -q 'do_thing'; then
  assert_pass "REVOKE inside a block comment is not a revoke: exits non-zero"
else
  assert_fail "REVOKE inside a block comment is not a revoke: exits non-zero" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 19: the mirror for test 18 — a closed block comment must not swallow the real REVOKE that
# follows it. Test 18 alone is satisfied by a scanner that never leaves comment state.
REPO="$(make_repo 20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
/* #1535: PUBLIC keeps EXECUTE by default,
   so every INVOKER function needs the pair below. */
REVOKE ALL ON FUNCTION public.do_thing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.do_thing(uuid) TO authenticated;")"
run_in "$REPO"
if [ "$script_exit" -eq 0 ]; then
  assert_pass "REVOKE after a closed block comment still counts: exits 0"
else
  assert_fail "REVOKE after a closed block comment still counts: exits 0" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 20: the safety valve. If the scan reaches end of file still inside a body, comment or
# string, it lost track somewhere and every verdict it drew from that file is unreliable. A
# different mechanism from tests 16-18, which cover a look-alike delimiter being read as real DDL
# and whose fixtures all close every construct they open — this one is the scan losing its place
# outright. Report it rather than mis-scan.
REPO="$(make_repo 20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END;
REVOKE ALL ON FUNCTION public.do_thing(uuid) FROM PUBLIC;")"
run_in "$REPO"
# Asserts the valve's own message, not merely a non-zero exit: this fixture happens to fail for an
# unrelated reason too (the REVOKE is swallowed by the unterminated body), and "it failed" would
# read as a working valve on a script that has none.
if [ "$script_exit" -ne 0 ] && printf '%s' "$script_output" | grep -q 'end of file.*20260101000001_fn.sql\|20260101000001_fn.sql.*end of file'; then
  assert_pass "unterminated body at end of file: exits non-zero, names the file"
else
  assert_fail "unterminated body at end of file: exits non-zero, names the file" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 21: `standard_conforming_strings` is on, so `\` escapes only inside an E'…' literal — and
# there `\'` does not end the string. Reading it as an end puts the scan one quote out of phase:
# the literal's real closing quote is taken as an *opening* one, and everything after it — the
# whole CREATE below included — is swallowed as string content, so the function never enters the
# set at all. Unchecked rather than unguarded, and the gate says OK.
#
# The trailing `--` line is load-bearing, not decoration. The EOF valve would otherwise catch this,
# since an out-of-phase scan ends inside a string; a `--` reached in *code* state clears the rest
# of its line without setting state, which resyncs the phase and leaves the valve silent. E'…' is
# already live in the set (20260724034551, 20260805022307), just not yet with an escaped quote.
REPO="$(make_repo 20260101000001_fn.sql "COMMENT ON TABLE public.lessons IS E'it\\'s a note';
CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
-- note: don't edit")"
run_in "$REPO"
if [ "$script_exit" -ne 0 ] && printf '%s' "$script_output" | grep -q 'do_thing'; then
  assert_pass "escaped quote in an E'…' literal does not end it: exits non-zero"
else
  assert_fail "escaped quote in an E'…' literal does not end it: exits non-zero" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 22: the mirror for test 21 — an E'…' literal that legitimately closes must not swallow the
# REVOKE after it. The `\\` immediately before the closing quote is the point: it is an escaped
# *backslash*, so the quote that follows it still closes. A fix that skips any quote with a
# backslash anywhere before it passes test 21 while never closing an E-string again.
REPO="$(make_repo 20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
COMMENT ON FUNCTION public.do_thing(uuid) IS E'it\\'s at C:\\\\';
REVOKE ALL ON FUNCTION public.do_thing(uuid) FROM PUBLIC;")"
run_in "$REPO"
if [ "$script_exit" -eq 0 ]; then
  assert_pass "E'…' closing after an escaped backslash: exits 0"
else
  assert_fail "E'…' closing after an escaped backslash: exits 0" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 23: dollar-quote tags are case-sensitive in Postgres, but `shopt -s nocasematch` governs
# `case` and `[[` — so a body opened `$Body$` closes on the *text* `$body$` inside it. This one
# fails closed, not open: the scan drifts and the file ends inside a string, so a valid migration
# draws a false `FAIL … reached end of file`, which blocks CI.
#
# Also the suite's first fixture with a tagged `$tag$` quote at all — 933e8726 generalised the
# scanner from bare `$$` to any tag and nothing has covered that since.
REPO="$(make_repo 20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$Body\$
BEGIN
  RAISE NOTICE 'the \$body\$ tag is lowercase here';
END;
\$Body\$;
REVOKE ALL ON FUNCTION public.do_thing(uuid) FROM PUBLIC;")"
run_in "$REPO"
if [ "$script_exit" -eq 0 ]; then
  assert_pass "lowercase look-alike tag does not close a \$Body\$ body: exits 0"
else
  assert_fail "lowercase look-alike tag does not close a \$Body\$ body: exits 0" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 24: a doubled `''` is an escaped quote and the string continues past it. This pins the
# behaviour; it does not kill a mutant, and the comment says so rather than implying coverage it
# doesn't have. Deleting the scanner's `''` branch is behaviour-preserving: the second quote of
# the pair sits at position 0 of the remaining text, so the code-state scan re-enters string state
# with identical `rest` and an unchanged `code`. The branch is kept anyway, so that an E'…'
# literal's escape flag survives a `''` structurally rather than by that coincidence.
REPO="$(make_repo 20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
COMMENT ON FUNCTION public.do_thing(uuid) IS 'it''s guarded';
REVOKE ALL ON FUNCTION public.do_thing(uuid) FROM PUBLIC;")"
run_in "$REPO"
if [ "$script_exit" -eq 0 ]; then
  assert_pass "doubled '' inside a string literal: exits 0"
else
  assert_fail "doubled '' inside a string literal: exits 0" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 25: string state carries across lines. A REVOKE-shaped line inside a multi-line string is
# text, not DDL — the same shape as test 13's dollar-quoted body, through the construct that
# actually needs the state to persist past a newline. A scanner that reset state per line counts
# the quoted REVOKE and exits 0.
REPO="$(make_repo 20260101000001_fn.sql "CREATE FUNCTION public.do_thing(p_id uuid) RETURNS void
LANGUAGE plpgsql AS \$\$ BEGIN END; \$\$;
COMMENT ON FUNCTION public.do_thing(uuid) IS 'a note that spans lines:
REVOKE ALL ON FUNCTION public.do_thing(uuid) FROM PUBLIC;
end of note';")"
run_in "$REPO"
if [ "$script_exit" -ne 0 ] && printf '%s' "$script_output" | grep -q 'do_thing'; then
  assert_pass "REVOKE inside a multi-line string is not a revoke: exits non-zero"
else
  assert_fail "REVOKE inside a multi-line string is not a revoke: exits non-zero" "exit=$script_exit output=$script_output"
fi
rm -rf "$REPO"

# Test 26: the live migration set is the real fixture — the guard has to pass against it, which is
# the acceptance criterion this issue's migration exists to satisfy.
if (cd "$SCRIPT_DIR/.." && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "the repo's own migration set: exits 0"
else
  assert_fail "the repo's own migration set: exits 0" "$(cd "$SCRIPT_DIR/.." && bash "$SCRIPT" 2>&1)"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
