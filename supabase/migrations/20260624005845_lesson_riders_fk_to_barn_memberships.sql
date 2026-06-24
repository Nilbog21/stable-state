-- 0. Purge lesson data before schema change. TRUNCATE avoids row-level trigger events
--    (DELETE would schedule the deferred participant-count triggers, which then block
--    subsequent ALTER TABLE statements on lesson_riders). Data is reseeded by reset-db.sh.
TRUNCATE public.lessons CASCADE;

-- 1. Add composite UNIQUE to barn_memberships so it can be a composite FK target
ALTER TABLE public.barn_memberships ADD CONSTRAINT barn_memberships_barn_id_id_key UNIQUE (barn_id, id);

-- 2. Drop old composite FK from lesson_riders → riders
DO $$
DECLARE v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.lesson_riders'::regclass
    AND confrelid = 'public.riders'::regclass
    AND contype = 'f';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.lesson_riders DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

-- 3. Backfill: map rider_id → barn_memberships.id via riders.user_id
UPDATE public.lesson_riders lr
SET rider_id = bm.id
FROM public.riders r
JOIN public.barn_memberships bm ON bm.user_id = r.user_id AND bm.barn_id = r.barn_id
WHERE r.id = lr.rider_id AND r.user_id IS NOT NULL;

-- 4. Delete lesson_riders rows for anonymous riders (no matching membership)
DELETE FROM public.lesson_riders
WHERE rider_id NOT IN (SELECT id FROM public.barn_memberships);

-- 5. Flush deferred triggers before ALTER TABLE (DELETE above fires them; ALTER TABLE
--    cannot run while trigger events are pending in the same transaction)
SET CONSTRAINTS ALL IMMEDIATE;

-- 6. Add new FK lesson_riders(barn_id, rider_id) → barn_memberships(barn_id, id)
ALTER TABLE public.lesson_riders
  ADD CONSTRAINT lesson_riders_barn_id_rider_id_fkey
  FOREIGN KEY (barn_id, rider_id) REFERENCES public.barn_memberships (barn_id, id) ON DELETE CASCADE;
