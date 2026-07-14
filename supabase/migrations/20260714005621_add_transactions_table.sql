-- lesson_riders is the only one of the four transaction source tables (lessons,
-- lesson_riders, agreement_charges, horse_expenses) without a UNIQUE(barn_id, id) —
-- add it so transactions.lesson_rider_id can use the same composite-FK cross-barn
-- integrity pattern as the other three source columns.
ALTER TABLE public.lesson_riders
  ADD CONSTRAINT lesson_riders_barn_id_id_key UNIQUE (barn_id, id);

CREATE TYPE public.transaction_kind AS ENUM (
  'lesson_fee',
  'rider_cancellation_fee',
  'instructor_payout',
  'lease_charge',
  'board_charge',
  'expense'
);

CREATE TABLE public.transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id             UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  kind                public.transaction_kind NOT NULL,
  amount              NUMERIC NOT NULL,
  collected           BOOLEAN NOT NULL,
  payment_type        public.payment_type_enum,
  membership_id       UUID,
  horse_id            UUID,
  occurred_at         TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  lesson_id           UUID,
  lesson_rider_id     UUID,
  agreement_charge_id UUID,
  expense_id          UUID,
  FOREIGN KEY (barn_id, membership_id) REFERENCES public.barn_memberships (barn_id, id)
    ON DELETE SET NULL (membership_id),
  FOREIGN KEY (barn_id, horse_id) REFERENCES public.horses (barn_id, id)
    ON DELETE SET NULL (horse_id),
  FOREIGN KEY (barn_id, lesson_id) REFERENCES public.lessons (barn_id, id)
    ON DELETE SET NULL (lesson_id),
  FOREIGN KEY (barn_id, lesson_rider_id) REFERENCES public.lesson_riders (barn_id, id)
    ON DELETE SET NULL (lesson_rider_id),
  FOREIGN KEY (barn_id, agreement_charge_id) REFERENCES public.agreement_charges (barn_id, id)
    ON DELETE SET NULL (agreement_charge_id),
  FOREIGN KEY (barn_id, expense_id) REFERENCES public.horse_expenses (barn_id, id)
    ON DELETE SET NULL (expense_id),
  CHECK (
    (CASE WHEN lesson_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN lesson_rider_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN agreement_charge_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN expense_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX transactions_barn_id_idx ON public.transactions (barn_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
