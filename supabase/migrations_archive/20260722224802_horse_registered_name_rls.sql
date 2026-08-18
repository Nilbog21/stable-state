-- #1001 review fix: get_horse_exertion_summary was dropped and recreated in
-- the companion functions migration to add registered_name to its return
-- shape. DROP FUNCTION discards a function's ACL, so its EXECUTE grant must
-- be re-applied here the same way #936 did for this same function (see
-- 20260716005944_release3_rls.sql) — otherwise it silently reverts to
-- PUBLIC-executable.
REVOKE ALL ON FUNCTION get_horse_exertion_summary(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_horse_exertion_summary(uuid, timestamptz) TO authenticated;
