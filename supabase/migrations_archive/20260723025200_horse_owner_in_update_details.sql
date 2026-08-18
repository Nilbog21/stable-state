-- #998 review follow-up: update_horse_details grows from 11 to 12 params,
-- mirroring the #759/#1005/#1001 drop/recreate pattern, so owner reassignment
-- shares the horse detail page's single-Save-button atomic write instead of
-- running as a second, non-atomic DB call that could leave a status/notes
-- change persisted while an owner-write failure surfaces a generic error.
-- p_owning_member_id is written as-given (including NULL, which clears the
-- owner) rather than COALESCE'd, same treatment as p_registered_name.
DROP FUNCTION public.update_horse_details(uuid, uuid, text, boolean, boolean, text, int, int, text, text, text);

CREATE FUNCTION update_horse_details(
  p_horse_id uuid,
  p_barn_id uuid,
  p_name text,
  p_is_active boolean,
  p_is_available boolean,
  p_unavailability_reason text,
  p_exhaustion_threshold_moderate int DEFAULT NULL,
  p_exhaustion_threshold_high int DEFAULT NULL,
  p_feed_notes text DEFAULT NULL,
  p_medication_notes text DEFAULT NULL,
  p_registered_name text DEFAULT NULL,
  p_owning_member_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE horses
  SET name = COALESCE(p_name, name),
      is_active = p_is_active,
      is_available = p_is_available,
      unavailability_reason = p_unavailability_reason,
      deactivated_at = CASE
        WHEN horses.is_active = p_is_active THEN horses.deactivated_at
        WHEN p_is_active THEN NULL
        ELSE now()
      END,
      exhaustion_threshold_moderate = p_exhaustion_threshold_moderate,
      exhaustion_threshold_high = p_exhaustion_threshold_high,
      feed_notes = p_feed_notes,
      medication_notes = p_medication_notes,
      registered_name = p_registered_name,
      owning_member_id = p_owning_member_id
  WHERE id = p_horse_id AND barn_id = p_barn_id;
END;
$$;
