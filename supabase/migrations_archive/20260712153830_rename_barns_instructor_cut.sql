-- #776: instructor_cut moves from barn-level (live-computed) to per-tier
-- (snapshotted per lesson). Rename the barn column to make clear it's now
-- only a seed value for new tiers and Custom lessons, not a live multiplier.
ALTER TABLE public.barns RENAME COLUMN instructor_cut TO default_instructor_cut;
