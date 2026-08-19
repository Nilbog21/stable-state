-- #1640: re-apply the two expense writers' grants after the p_shows_on_calendar signature
-- change dropped and recreated them. Same REVOKE-then-GRANT pair as the release-4 set, with
-- the trailing boolean added to each signature.
REVOKE EXECUTE ON FUNCTION create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz, boolean) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz, boolean) TO authenticated, service_role;
