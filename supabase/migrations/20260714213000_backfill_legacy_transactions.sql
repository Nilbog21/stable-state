-- #885 review follow-up: getLessonsByBarn/getLessonById/getChargesForAgreement now
-- read payment_type exclusively from `transactions`, defaulting to NULL ("unpaid")
-- when no matching row exists. Every lesson/agreement_charge created before the
-- ledger's dual-write RPCs (#827/#828) landed has no transactions row at all, so
-- without this backfill every already-paid pre-release-3 lesson/charge would
-- regress to "Unpaid" the moment this ships.
--
-- Reuses sync_lesson_transactions' exact insert shape for lessons (same amount/
-- collected/payment_type derivation), so backfilled rows are indistinguishable
-- from ones the RPC would have written. ON CONFLICT DO NOTHING means a lesson
-- already synced by real #827+ usage (dev/testing on this release branch) is left
-- untouched — this only fills genuine gaps.
INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, occurred_at, lesson_id)
SELECT barn_id, 'lesson_fee', fee, (fee = 0 OR payment_type IS NOT NULL), payment_type, lesson_at, id
FROM lessons
ON CONFLICT (lesson_id) WHERE kind = 'lesson_fee' DO NOTHING;

INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, membership_id, occurred_at, lesson_id)
SELECT barn_id, 'instructor_payout', -instructor_cut, (fee = 0 OR payment_type IS NOT NULL), payment_type, instructor_id, lesson_at, id
FROM lessons
ON CONFLICT (lesson_id) WHERE kind = 'instructor_payout' DO NOTHING;

-- agreement_charges has no partial unique index on (agreement_charge_id, kind) to
-- ON CONFLICT against (unlike lessons — see create_agreement_with_first_charge/
-- generate_agreement_charge, which rely on agreement_charges' own UNIQUE(agreement_id,
-- period) to prevent duplicate charges instead), so this uses WHERE NOT EXISTS.
INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, membership_id, horse_id, occurred_at, agreement_charge_id)
SELECT
  ac.barn_id,
  CASE WHEN a.kind = 'lease' THEN 'lease_charge' ELSE 'board_charge' END,
  ac.fee,
  (ac.payment_type IS NOT NULL),
  ac.payment_type,
  a.rider_id,
  a.horse_id,
  ac.period::timestamptz,
  ac.id
FROM agreement_charges ac
JOIN agreements a ON a.id = ac.agreement_id AND a.barn_id = ac.barn_id
WHERE NOT EXISTS (
  SELECT 1 FROM transactions t
  WHERE t.agreement_charge_id = ac.id AND t.kind IN ('lease_charge', 'board_charge')
);
