-- #776: snapshot instructor_cut per lesson_tiers row, and per lessons/lesson_series
-- row at creation time (mirroring how fee/tier_name are already snapshotted).
-- Backfill existing rows from the barn's current default_instructor_cut.
-- DEFAULT 0 is a defensive floor only — every real INSERT path always passes
-- an explicit value (see the accompanying RPC migration).

ALTER TABLE public.lesson_tiers ADD COLUMN instructor_cut NUMERIC NOT NULL DEFAULT 0 CHECK (instructor_cut >= 0);

UPDATE public.lesson_tiers t
SET instructor_cut = b.default_instructor_cut
FROM public.barns b
WHERE b.id = t.barn_id;

ALTER TABLE public.lessons ADD COLUMN instructor_cut NUMERIC NOT NULL DEFAULT 0 CHECK (instructor_cut >= 0);

UPDATE public.lessons l
SET instructor_cut = b.default_instructor_cut
FROM public.barns b
WHERE b.id = l.barn_id;

ALTER TABLE public.lesson_series ADD COLUMN instructor_cut NUMERIC NOT NULL DEFAULT 0 CHECK (instructor_cut >= 0);

UPDATE public.lesson_series s
SET instructor_cut = b.default_instructor_cut
FROM public.barns b
WHERE b.id = s.barn_id;
