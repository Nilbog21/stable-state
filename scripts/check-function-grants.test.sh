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

# Test 12: the live migration set is the real fixture — the guard has to pass against it, which is
# the acceptance criterion this issue's migration exists to satisfy.
if (cd "$SCRIPT_DIR/.." && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "the repo's own migration set: exits 0"
else
  assert_fail "the repo's own migration set: exits 0" "$(cd "$SCRIPT_DIR/.." && bash "$SCRIPT" 2>&1)"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
