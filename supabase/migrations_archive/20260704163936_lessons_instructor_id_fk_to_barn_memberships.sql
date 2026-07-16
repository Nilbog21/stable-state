-- Drop old FK from lessons.instructor_id -> auth.users
DO $$
DECLARE v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.lessons'::regclass
    AND confrelid = 'auth.users'::regclass
    AND contype = 'f';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.lessons DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

-- Backfill: map instructor_id (auth user id) -> matching barn_memberships.id in the same barn.
UPDATE public.lessons l
SET instructor_id = bm.id
FROM public.barn_memberships bm
WHERE bm.user_id = l.instructor_id AND bm.barn_id = l.barn_id;

-- Rows whose instructor has since left the barn (membership deleted, auth account intact)
-- have no matching barn_memberships row and are still holding the raw auth-user id after the
-- backfill above. Null them out rather than deleting the lesson, matching this column's
-- existing ON DELETE SET NULL semantics and preserving lesson/fee history.
UPDATE public.lessons
SET instructor_id = NULL
WHERE instructor_id IS NOT NULL
  AND instructor_id NOT IN (SELECT id FROM public.barn_memberships);

-- New composite FK: lessons(barn_id, instructor_id) -> barn_memberships(barn_id, id).
-- ON DELETE SET NULL (instructor_id) blanks out only the instructor attribution when a
-- trainer's membership is removed; barn_id (NOT NULL) is left untouched and the lesson/fee
-- history is preserved rather than cascading away, matching the original single-column
-- ON DELETE SET NULL semantics against auth.users.
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_barn_id_instructor_id_fkey
  FOREIGN KEY (barn_id, instructor_id) REFERENCES public.barn_memberships (barn_id, id)
  ON DELETE SET NULL (instructor_id);
