#!/usr/bin/env bash
set -euo pipefail

# Resolved before the cd, and re-entered via `bash` rather than executed: --self-check calls
# this script twice, $0 is relative when invoked as `bash scripts/…`, and the file carries no
# executable bit.
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

cd "$(git rev-parse --show-toplevel)"

# Proves that two migration sets produce the *same schema* — the check `RELEASE_CEREMONY.md`
# Wrapup step 4 requires of a squash, and the one thing `Verify Migrations` CI does not do.
# That workflow runs `supabase start && supabase db reset`, which proves the set **replays**;
# a squash that silently drops a REVOKE, a default or a policy replays perfectly. #1542.
#
# Before this, the equivalence proof was hand-rolled at each of the three squashes and
# survived only as prose in supabase/migrations_archive/README.md — where it had already
# drifted (#657 used plain `migra`, #658 and #972 `migra --with-privileges`). #972's diff is
# recorded there as empty, yet that squash dropped set_instructor_cut's REVOKE, which #1158
# restored and #1535 built a CI gate for. A verification nobody can re-run is one nobody can
# check.
#
#   bash scripts/verify-migration-equivalence.sh --before-ref <git-ref> [--after-ref <ref>]
#   bash scripts/verify-migration-equivalence.sh --self-check
#
# --before-ref  the pre-squash state: supabase/migrations/ as of that git ref
# --after-ref   the consolidated state; defaults to the working tree
# --keep        leave the two throwaway databases behind for inspection
#
# `migra` is deliberately NOT used: it needs a Python install this repo has nowhere else,
# and `pg_dump --schema-only` + `diff` is *stricter* — it compares the rendered schema text
# including every ACL, so a dropped GRANT/REVOKE shows up as a diff line rather than relying
# on a `--with-privileges` flag someone has to remember. The cost of being stricter is
# documented below.

PRELUDE_ROLE=postgres

usage() { sed -n '7,30p' "$0" | sed 's/^# \?//'; exit 2; }

before_ref=""
after_ref=""
keep=0
self_check=0
while [ $# -gt 0 ]; do
  case "$1" in
    --before-ref) before_ref="${2:-}"; shift 2 ;;
    --after-ref)  after_ref="${2:-}"; shift 2 ;;
    --keep)       keep=1; shift ;;
    --self-check) self_check=1; shift ;;
    -h|--help)    usage ;;
    *) echo "unknown argument: $1" >&2; usage ;;
  esac
done

# The standing check, and it runs against real history rather than a fabricated fixture —
# #657's squash supplies both polarities.
#
#   POSITIVE  97855071^ (93 pre-baseline files) vs bf620567 (the 3 consolidated ones, after
#             review fixes) must be identical. That is the verdict recorded in
#             supabase/migrations_archive/README.md, re-derived.
#   NEGATIVE  97855071^ vs 97855071 — the squash *as first pushed* — must FAIL. That commit
#             dropped 11 GRANTs across 6 tables; `bf620567` is titled "[#657] Fix review
#             findings: repair script bug, missing grants, stale README claim", so a human
#             reviewer caught it and this reproduces the catch.
#
# The negative half is what makes the positive half mean anything: a script that reported
# "identical" unconditionally would pass the positive check alone. Run both after touching
# this file. It is deliberately not in ci.sh — CI has no PostgreSQL server, and a check
# that skips in CI reports the same green as one that ran.
if [ "$self_check" -eq 1 ]; then
  echo "Self-check 1/2 (positive): 97855071^ vs bf620567 — must be identical."
  if ! bash "$SELF" --before-ref '97855071^' --after-ref bf620567 >/dev/null 2>&1; then
    echo "SELF-CHECK FAILED: the known-equivalent #657 pair reported a difference." >&2
    exit 1
  fi
  echo "  ok"
  echo "Self-check 2/2 (negative): 97855071^ vs 97855071 — must report the 11 dropped GRANTs."
  neg="$(bash "$SELF" --before-ref '97855071^' --after-ref 97855071 2>&1)" && {
    echo "SELF-CHECK FAILED: the pre-fix #657 squash reported identical; it dropped 11 GRANTs." >&2
    exit 1
  }
  # Asserted off the "ACL changes:" summary rather than by counting `-GRANT` lines in the
  # printed diff: that body is truncated at 80 lines, so counting it under-reports whenever
  # the drift is large — which is exactly when this check matters.
  dropped=$(sed -n 's/^ACL changes: \([0-9]*\) removed.*/\1/p' <<<"$neg")
  if [ "${dropped:-none}" != "11" ]; then
    echo "SELF-CHECK FAILED: expected 11 removed ACL lines, reported ${dropped:-none}." >&2
    exit 1
  fi
  echo "  ok — 11 removed ACL lines reported"
  echo ""
  echo "OK: self-check passed both polarities against #657's real history."
  exit 0
fi

[ -n "$before_ref" ] || { echo "--before-ref is required" >&2; usage; }

for tool in psql pg_dump; do
  command -v "$tool" >/dev/null 2>&1 || { echo "FAIL: $tool not on PATH" >&2; exit 1; }
done
pg_isready -q || { echo "FAIL: no PostgreSQL server reachable (pg_isready)" >&2; exit 1; }

# Everything is replayed with `role=$PRELUDE_ROLE`, and that is load-bearing rather than
# tidy. The migration set carries `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA
# public`, which grants `authenticated`/`service_role` on every table created afterwards.
# Replay as any other role and those defaults never fire, so the older set comes out missing
# grants the consolidated set writes explicitly — a 75-line diff of pure artifact on the
# #657 pair, which is exactly the noise that gets a verification tool ignored. Fail closed
# rather than emit it.
# Captured into a variable rather than piped into `grep -q`: under `pipefail` an early-exit
# consumer can SIGPIPE the producer and turn a match into a failure (scripts/CLAUDE.md's
# Shell hazards; check-pipefail-race.sh enforces it).
role_present="$(psql -qtAX -d postgres -c "select 1 from pg_roles where rolname='$PRELUDE_ROLE'")"
if [ "$role_present" != "1" ]; then
  echo "FAIL: role '$PRELUDE_ROLE' does not exist in this cluster." >&2
  echo "      The migrations' ALTER DEFAULT PRIVILEGES clauses are scoped FOR ROLE $PRELUDE_ROLE;" >&2
  echo "      replaying as anyone else silently under-applies table grants and reports a" >&2
  echo "      diff made entirely of missing GRANT lines." >&2
  exit 1
fi
export PGOPTIONS="-c role=$PRELUDE_ROLE"

db_before="mig_equiv_before_$$"
db_after="mig_equiv_after_$$"
tmp="$(mktemp -d)"

cleanup() {
  if [ "$keep" -eq 1 ]; then
    echo "Kept: databases $db_before / $db_after, dumps in $tmp"
    return
  fi
  # PGOPTIONS forces role=postgres, which cannot DROP DATABASE owned by the connecting
  # superuser in every configuration — unset it for teardown only.
  PGOPTIONS="" psql -q -d postgres -c "drop database if exists $db_before" >/dev/null 2>&1 || true
  PGOPTIONS="" psql -q -d postgres -c "drop database if exists $db_after" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

# Minimal stand-ins for what Supabase provides and the migrations reference: the three
# PostgREST roles, and the auth/storage objects the policies name (auth.uid 162x,
# storage.foldername 88x, storage.objects 41x, auth.users 11x, auth.email 2x,
# storage.buckets 1x). Identical in both databases, so it cancels in the diff — its job is
# to let the SQL parse, not to model Supabase. Roles are cluster-global and may already
# exist (and may be in use by other databases), so they are created if absent and never
# dropped. No CREATE EXTENSION is needed: the set's only external function is
# gen_random_uuid(), core since PG13.
write_prelude() {
  cat > "$tmp/prelude.sql" <<'SQL'
do $r$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $r$;
create schema auth;
create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
create table storage.buckets (id text primary key, name text, public boolean default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  metadata jsonb
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
SQL
}

# Replays supabase/migrations/ as of a git ref (empty ref = the working tree) into a fresh
# database. Files are fed in filename order, which is the order the Supabase CLI applies
# them in.
replay() {
  # Split rather than one `local` line: bash expands the whole command before assigning, so
  # `src="$tmp/$db"` alongside `db="$2"` reads $db before it is set — a `set -u` abort.
  local ref="$1" db="$2" label="$3"
  local src="$tmp/$db" count=0 out sql
  mkdir -p "$src"
  if [ -z "$ref" ]; then
    cp supabase/migrations/*.sql "$src/"
  else
    local f
    while IFS= read -r f; do
      git show "$ref:$f" > "$src/$(basename "$f")"
    done < <(git ls-tree -r --name-only "$ref" -- supabase/migrations/ | grep '\.sql$')
  fi
  count=$(find "$src" -name '*.sql' | wc -l)
  [ "$count" -gt 0 ] || { echo "FAIL: no .sql files found for $label" >&2; exit 1; }

  PGOPTIONS="" psql -q -d postgres -c "drop database if exists $db" >/dev/null
  PGOPTIONS="" psql -q -d postgres -c "create database $db" >/dev/null
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$tmp/prelude.sql" >/dev/null


  for sql in $(find "$src" -name '*.sql' | sort); do
    if ! out=$(psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$sql" 2>&1); then
      echo "FAIL: $label — $(basename "$sql") did not replay:" >&2
      echo "$out" | grep -E '^psql:' >&2 || echo "$out" >&2
      exit 1
    fi
  done
  echo "  $label: replayed $count file(s) into $db"
}

# `--no-owner` because ownership is environmental — both databases are created by whoever
# runs this — while ACLs are exactly what a dropped GRANT/REVOKE changes, so privileges stay
# in. PG18 stamps each dump with a random \restrict/\unrestrict nonce; stripping those two
# lines is the whole normalisation, and the only one, so nothing real is being filtered away.
dump_schema() {
  pg_dump --schema-only --no-owner -n public -n storage -d "$1" \
    | grep -vE '^\\(un)?restrict ' > "$2"
}

write_prelude
echo "Replaying both sets (role=$PRELUDE_ROLE):"
replay "$before_ref" "$db_before" "before (${before_ref})"
replay "$after_ref"  "$db_after"  "after (${after_ref:-working tree})"

dump_schema "$db_before" "$tmp/before.sql"
dump_schema "$db_after"  "$tmp/after.sql"

if diff -u "$tmp/before.sql" "$tmp/after.sql" > "$tmp/diff.txt"; then
  echo "OK: schemas are identical — $(wc -l < "$tmp/before.sql") lines of schema, including all ACLs"
  exit 0
fi

echo "" >&2
echo "FAIL: the two migration sets do not produce the same schema." >&2
echo "" >&2

# Counted off the whole diff, and printed before it, because the body below is truncated to
# keep a large drift readable — a reader (and --self-check) needs a total that the truncation
# cannot understate. ACLs get their own line because a dropped GRANT/REVOKE is this check's
# headline class and reads as ordinary context in a long diff.
acl_removed=$(grep -cE '^-(GRANT|REVOKE) ' "$tmp/diff.txt" || true)
acl_added=$(grep -cE '^\+(GRANT|REVOKE) ' "$tmp/diff.txt" || true)
echo "ACL changes: $acl_removed removed, $acl_added added" >&2
echo "" >&2

sed -n '3,80p' "$tmp/diff.txt" >&2
total=$(grep -cE '^[+-]' "$tmp/diff.txt" || true)
echo "" >&2
echo "($total differing lines; re-run with --keep to inspect the databases.)" >&2
echo "" >&2
echo "Known false positives, before treating this as a regression:" >&2
echo "  - Column ORDER differs when a squash flattens CREATE+ALTER ADD into one CREATE and" >&2
echo "    the original had since dropped a column. Real to pg_dump, invisible to migra." >&2
echo "  - A comment or default rendered differently by an equivalent expression." >&2
echo "Everything else — a missing GRANT/REVOKE, policy, index, constraint or default — is" >&2
echo "real, and is the class this exists to catch." >&2
exit 1
