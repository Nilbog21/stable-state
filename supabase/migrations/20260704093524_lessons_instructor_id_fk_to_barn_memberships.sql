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
-- Every existing instructor has a real account and an active membership row, so this is lossless.
UPDATE public.lessons l
SET instructor_id = bm.id
FROM public.barn_memberships bm
WHERE bm.user_id = l.instructor_id AND bm.barn_id = l.barn_id;

-- New composite FK: lessons(barn_id, instructor_id) -> barn_memberships(barn_id, id).
-- ON DELETE SET NULL (instructor_id) blanks out only the instructor attribution when a
-- trainer's membership is removed; barn_id (NOT NULL) is left untouched and the lesson/fee
-- history is preserved rather than cascading away, matching the original single-column
-- ON DELETE SET NULL semantics against auth.users.
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_barn_id_instructor_id_fkey
  FOREIGN KEY (barn_id, instructor_id) REFERENCES public.barn_memberships (barn_id, id)
  ON DELETE SET NULL (instructor_id);
