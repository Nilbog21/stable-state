-- #1546: restore service_role EXECUTE on the public functions #1535 silently cut off.
--
-- #1535 revoked EXECUTE from PUBLIC on nine invoker RPCs and granted `authenticated` back, naming
-- `service_role` on only four. Every *other* public function had been reachable by service-role
-- callers only through the PUBLIC grant it was never given explicitly — so the revoke removed
-- their access too: 39 of 58 public functions were left with no service_role EXECUTE. Surfaced by
-- the 2026-08-16 checklist run, whose service-role e2e fixture got `permission denied for function
-- set_horse_owner` and stopped the suite with 10 tests unverdicted.
--
-- App runtime was unaffected — its only service-role RPCs (teardown_dev_barn_lessons,
-- teardown_all_lesson_data) kept their grants. The blast radius was e2e fixtures and the
-- scripts/*.ts service-role clients.
--
-- The shape here mirrors what service_role already has for TABLES in
-- 20260629004612_baseline_rls.sql:291-292 — a blanket grant plus a default-privileges rule — so a
-- function added later is covered at creation rather than at the next incident. That gap is what
-- 20260723182521_nearby_instructor_unread_title_service_role_grant.sql was filed for, and what
-- this closes for good.
--
-- Nothing is weakened: service_role already holds GRANT ALL ON ALL TABLES and bypasses RLS, so
-- function EXECUTE grants it no reach it lacked. The `authenticated` half is untouched and still
-- has to be reasoned about per function, as does every function's REVOKE … FROM PUBLIC —
-- scripts/check-function-grants.sh continues to enforce that half.

-- Covers the functions that exist at this point in the replay.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Covers every function created after it. `FOR ROLE postgres` matches the table rule verbatim:
-- default privileges are keyed on the creating role, so a different spelling here would be a
-- silent no-op.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
