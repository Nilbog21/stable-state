-- Consolidated release-3 backfills (#658). These four one-time data migrations
-- must be preserved as real ALTER+backfill DML, not flattened into the fresh
-- CREATE TABLE shapes in the companion schema file — they migrate values on
-- PRE-EXISTING baseline tables (lessons, lesson_tiers, rider_documents,
-- staff_documents) that already carry real historical data on prod, which
-- hasn't run any release-3 migration yet. A migra schema-only diff can't catch
-- a missing backfill (a fresh replay DB has zero rows either way) — these are
-- kept because a real prod cutover needs them, not because the diff requires it.

-- 1. lessons.instructor_id: FK swap from auth.users to barn_memberships.
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
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_barn_id_instructor_id_fkey
  FOREIGN KEY (barn_id, instructor_id) REFERENCES public.barn_memberships (barn_id, id)
  ON DELETE SET NULL (instructor_id);

-- 2. rider_documents.rider_id / staff_documents.trainer_id: FK swap from
-- auth.users to barn_memberships, same rationale as (1) above.
ALTER TABLE public.rider_documents DROP CONSTRAINT rider_documents_rider_id_fkey;
ALTER TABLE public.staff_documents DROP CONSTRAINT staff_documents_trainer_id_fkey;

UPDATE public.rider_documents rd
SET rider_id = bm.id
FROM public.barn_memberships bm
WHERE bm.user_id = rd.rider_id AND bm.barn_id = rd.barn_id;

UPDATE public.staff_documents sd
SET trainer_id = bm.id
FROM public.barn_memberships bm
WHERE bm.user_id = sd.trainer_id AND sd.barn_id = bm.barn_id;

-- Defensive cleanup: a document's owner may have been removed from the barn (hard DELETE FROM
-- barn_memberships) after upload; under the old auth.users FK this left the document orphaned
-- but intact. Once rider_id/trainer_id must reference barn_memberships(id), such a row has no
-- valid target left.
DELETE FROM public.rider_documents rd
WHERE NOT EXISTS (SELECT 1 FROM public.barn_memberships bm WHERE bm.id = rd.rider_id);

DELETE FROM public.staff_documents sd
WHERE NOT EXISTS (SELECT 1 FROM public.barn_memberships bm WHERE bm.id = sd.trainer_id);

-- ON DELETE CASCADE matches lesson_riders/agreements (dependent records tied to the
-- membership), not lessons.instructor_id's SET NULL (financial history that must survive).
ALTER TABLE public.rider_documents
  ADD CONSTRAINT rider_documents_barn_id_rider_id_fkey
  FOREIGN KEY (barn_id, rider_id) REFERENCES public.barn_memberships (barn_id, id) ON DELETE CASCADE;

ALTER TABLE public.staff_documents
  ADD CONSTRAINT staff_documents_barn_id_trainer_id_fkey
  FOREIGN KEY (barn_id, trainer_id) REFERENCES public.barn_memberships (barn_id, id) ON DELETE CASCADE;

-- 3. instructor_cut: backfill pre-existing lesson_tiers/lessons rows from the
-- barn's current default_instructor_cut (lesson_series has no pre-existing rows —
-- it's a brand-new table — so no backfill is needed for it; its instructor_cut
-- column already defaults to 0 per the schema file).
UPDATE public.lesson_tiers t
SET instructor_cut = b.default_instructor_cut
FROM public.barns b
WHERE b.id = t.barn_id;

UPDATE public.lessons l
SET instructor_cut = b.default_instructor_cut
FROM public.barns b
WHERE b.id = l.barn_id;

-- 4. transactions: backfill lesson_fee/instructor_payout rows for lessons that
-- predate the ledger, so an already-paid pre-release-3 lesson doesn't regress to
-- "Unpaid" once readers cut over to `transactions`. Reuses the exact insert shape
-- the write RPCs (release3_functions.sql) use, so backfilled rows are
-- indistinguishable from ones an RPC would have written. Must run before the
-- payment_type columns are dropped below, since it reads them.
INSERT INTO public.transactions (barn_id, kind, amount, collected, payment_type, occurred_at, lesson_id)
SELECT barn_id, 'lesson_fee', fee, (fee = 0 OR payment_type IS NOT NULL), payment_type, lesson_at, id
FROM public.lessons
ON CONFLICT (lesson_id) WHERE kind = 'lesson_fee' DO NOTHING;

INSERT INTO public.transactions (barn_id, kind, amount, collected, payment_type, membership_id, occurred_at, lesson_id)
SELECT barn_id, 'instructor_payout', -instructor_cut, (fee = 0 OR payment_type IS NOT NULL), payment_type, instructor_id, lesson_at, id
FROM public.lessons
ON CONFLICT (lesson_id) WHERE kind = 'instructor_payout' DO NOTHING;

-- No agreement_charges backfill branch: unlike lessons, agreement_charges is
-- itself a brand-new table in this squash (schema file above) and never carries
-- a payment_type column in final shape — every real agreement_charges row is
-- created exclusively through create_agreement_with_first_charge/
-- generate_agreement_charge (release3_functions.sql), both of which already
-- write a paired transactions row atomically at insert time. There is no
-- "legacy, pre-ledger" agreement_charges row to migrate in this consolidated
-- set's own timeline (the pre-consolidation intermediate state where one could
-- have existed is exactly what this squash collapses away). #659's separate
-- dev-DB reconciliation is where any real accumulated dev data gets handled.

-- 5. Only now that the transactions backfill above has consumed its values,
-- drop the legacy lessons.payment_type column — every reader/writer has been cut
-- over to the transactions ledger (release3_functions.sql). payment_type_enum
-- itself stays: still used by transactions.payment_type and horse_expenses.payment_type.
-- agreement_charges never had this column in this consolidated set (see above).
ALTER TABLE public.lessons DROP COLUMN payment_type;
