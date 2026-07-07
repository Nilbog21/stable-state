-- lesson_series.instructor_id was created with a plain single-column FK to
-- barn_memberships(id), unlike lessons.instructor_id which uses a barn-scoped
-- composite FK with ON DELETE SET NULL (see 20260704163936). Replace it with
-- the same shape so the DB enforces cross-barn integrity and removing a
-- trainer's membership doesn't hard-fail when they have an active series.
DO $$
DECLARE v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.lesson_series'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'public.lesson_series'::regclass AND attname = 'instructor_id'
    )];
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.lesson_series DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.lesson_series
  ADD CONSTRAINT lesson_series_barn_id_instructor_id_fkey
  FOREIGN KEY (barn_id, instructor_id) REFERENCES public.barn_memberships (barn_id, id)
  ON DELETE SET NULL (instructor_id);
