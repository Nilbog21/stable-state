-- #756: lesson_series.barn_id was created without ON DELETE CASCADE, unlike every
-- other barn-scoped table. Neither teardown_all_lesson_data() nor
-- teardown_dev_barn_lessons() deletes lesson_series rows, so teardownAllData's final
-- DELETE FROM barns fails with an FK violation whenever a lesson_series row exists
-- (e.g. after testing a Recurring (weekly) lesson).
DO $$
DECLARE v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.lesson_series'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'public.lesson_series'::regclass AND attname = 'barn_id'
    )];
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.lesson_series DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.lesson_series
  ADD CONSTRAINT lesson_series_barn_id_fkey
  FOREIGN KEY (barn_id) REFERENCES public.barns (id)
  ON DELETE CASCADE;
