-- #831: drop the two legacy payment_type columns now that every reader/writer
-- has been cut over to the transactions ledger — #885 stopped every RPC from
-- writing them, and this migration's own get_outstanding_transactions RPC
-- (see 20260715024545) is the last reader (getOutstandingLessonRows/
-- getOutstandingCharges). payment_type_enum itself stays — still used by
-- transactions.payment_type.
ALTER TABLE public.lessons DROP COLUMN payment_type;
ALTER TABLE public.agreement_charges DROP COLUMN payment_type;
