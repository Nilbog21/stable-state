-- Consolidated release-3 schema squash (#658): enums, tables, columns,
-- constraints, and indexes added on `release/release-3` since it branched off
-- `main` post-#657's baseline. Replaces the 90 files now archived at
-- supabase/migrations_archive/ (history kept there, not deleted). Content was
-- derived by replaying the full archived history on a throwaway Postgres
-- instance and diffing the result against these 4 consolidated files with
-- migra until the diff was empty — see supabase/migrations_archive/README.md.
--
-- This is a DELTA on top of the (untouched, out-of-scope) v2.0.2 baseline, not
-- a from-scratch snapshot: several columns/constraints below replace ones the
-- baseline already created on tables that carry real historical data (prod
-- hasn't run any release-3 migration yet). Two backfills that must run against
-- that pre-existing data — before columns they still depend on are dropped —
-- live in the companion 20260715075709_release3_backfills.sql, sequenced
-- immediately after this file.

-- barn_memberships: replace the baseline's plain UNIQUE(user_id, barn_id) (which used
-- NULLS NOT DISTINCT, so only one unclaimed/no-account member per barn was allowed)
-- with a partial unique index so multiple unclaimed stubs can coexist.
ALTER TABLE public.barn_memberships
  DROP CONSTRAINT barn_memberships_user_id_barn_id_key;

CREATE UNIQUE INDEX barn_memberships_user_id_barn_id_key
  ON public.barn_memberships (user_id, barn_id)
  WHERE (user_id IS NOT NULL);

-- New enums
CREATE TYPE public.agreement_kind AS ENUM ('lease', 'board');
CREATE TYPE public.agreement_cadence AS ENUM ('one_time', 'monthly');
CREATE TYPE public.transaction_kind AS ENUM (
  'lesson_fee',
  'rider_cancellation_fee',
  'instructor_payout',
  'lease_charge',
  'board_charge',
  'expense'
);

-- barns
ALTER TABLE public.barns ADD COLUMN default_board_fee NUMERIC NOT NULL DEFAULT 1000;
-- Constraint keeps its pre-rename auto-generated name (barns_instructor_cut_check):
-- real history added this column as `instructor_cut` (with an implicitly-named CHECK)
-- and only later renamed the COLUMN to default_instructor_cut — a column rename does
-- not rename its CHECK constraint, so the constraint name and column name diverge.
ALTER TABLE public.barns ADD COLUMN default_instructor_cut NUMERIC NOT NULL DEFAULT 25
  CONSTRAINT barns_instructor_cut_check CHECK (default_instructor_cut >= 0);
ALTER TABLE public.barns ADD COLUMN exhaustion_threshold_high INT NOT NULL DEFAULT 11 CHECK (exhaustion_threshold_high >= 0);
ALTER TABLE public.barns ADD COLUMN exhaustion_threshold_moderate INT NOT NULL DEFAULT 5 CHECK (exhaustion_threshold_moderate >= 0);
ALTER TABLE public.barns ADD CONSTRAINT barns_exhaustion_threshold_order CHECK (exhaustion_threshold_moderate < exhaustion_threshold_high);

-- horses
ALTER TABLE public.horses ADD COLUMN deactivated_at TIMESTAMPTZ;
ALTER TABLE public.horses ADD COLUMN exhaustion_threshold_high INT CHECK (exhaustion_threshold_high >= 0);
ALTER TABLE public.horses ADD COLUMN exhaustion_threshold_moderate INT CHECK (exhaustion_threshold_moderate >= 0);
ALTER TABLE public.horses ADD CONSTRAINT horses_exhaustion_threshold_order
  CHECK (exhaustion_threshold_moderate IS NULL OR exhaustion_threshold_high IS NULL OR exhaustion_threshold_moderate < exhaustion_threshold_high);

-- lesson_tiers
ALTER TABLE public.lesson_tiers ADD COLUMN instructor_cut NUMERIC NOT NULL DEFAULT 0 CHECK (instructor_cut >= 0);
-- NOT NULL enforcement below assumes no existing NULL rows; safe on a fresh baseline
-- replay and confirmed true of stable-state-dev/prod at the time these were written.
ALTER TABLE public.lesson_tiers ALTER COLUMN price SET NOT NULL;

-- agreements / agreement_charges (new tables; agreement_charges never carried a
-- payment_type column in final state — it was added then dropped entirely within
-- this squash's window, a true no-op, so it's simply omitted here)
CREATE TABLE public.agreements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id     UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  rider_id    UUID NOT NULL,
  horse_id    UUID NOT NULL,
  fee         NUMERIC NOT NULL,
  kind        public.agreement_kind NOT NULL DEFAULT 'lease',
  cadence     public.agreement_cadence NOT NULL,
  start_date  DATE NOT NULL DEFAULT current_date,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, id),
  FOREIGN KEY (barn_id, rider_id) REFERENCES public.barn_memberships (barn_id, id) ON DELETE CASCADE,
  FOREIGN KEY (barn_id, horse_id) REFERENCES public.horses (barn_id, id) ON DELETE CASCADE,
  CHECK (kind <> 'board' OR cadence = 'monthly')
);

CREATE TRIGGER agreements_set_updated_at
  BEFORE UPDATE ON public.agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.agreement_charges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id      UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  agreement_id UUID NOT NULL,
  period       DATE NOT NULL CHECK (period = date_trunc('month', period)::date),
  fee          NUMERIC NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, id),
  UNIQUE (agreement_id, period),
  FOREIGN KEY (barn_id, agreement_id) REFERENCES public.agreements (barn_id, id) ON DELETE CASCADE
);

ALTER TABLE public.agreement_charges ENABLE ROW LEVEL SECURITY;

-- horse_expenses / expense_horses (new tables; horse_expenses.payment_type is
-- part of this table's final shape from the start, since the table itself is new)
CREATE TABLE public.horse_expenses (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id                UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  expense_date           DATE NOT NULL,
  expense_time           TIME,
  amount                 NUMERIC(10,2),
  recipient              TEXT NOT NULL,
  expense_type           TEXT NOT NULL DEFAULT 'Unspecified',
  notes                  TEXT,
  applies_to_all_horses  BOOLEAN NOT NULL DEFAULT false,
  payment_type           public.payment_type_enum,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, id)
);

CREATE TRIGGER horse_expenses_set_updated_at
  BEFORE UPDATE ON public.horse_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.horse_expenses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.expense_horses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id    UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL,
  horse_id   UUID NOT NULL,
  UNIQUE (expense_id, horse_id),
  FOREIGN KEY (barn_id, expense_id) REFERENCES public.horse_expenses (barn_id, id) ON DELETE CASCADE,
  FOREIGN KEY (barn_id, horse_id) REFERENCES public.horses (barn_id, id) ON DELETE CASCADE
);

ALTER TABLE public.expense_horses ENABLE ROW LEVEL SECURITY;

-- lesson_series (new table; instructor_id/barn_id use their final composite-FK
-- shape directly — two later release-3 migrations only existed to repoint an
-- initially-too-narrow FK on this same new table, a pure no-op once authored fresh)
CREATE TABLE public.lesson_series (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id          UUID NOT NULL,
  instructor_id    UUID,
  fee              NUMERIC NOT NULL,
  lesson_type      public.lesson_type NOT NULL DEFAULT 'normal',
  jumping          BOOLEAN NOT NULL DEFAULT false,
  tier_name        TEXT NOT NULL DEFAULT 'Custom',
  horse_ids        UUID[] NOT NULL,
  exertion_levels  SMALLINT[] NOT NULL,
  rider_ids        UUID[] NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  instructor_cut   NUMERIC NOT NULL DEFAULT 0 CHECK (instructor_cut >= 0),
  UNIQUE (barn_id, id),
  FOREIGN KEY (barn_id) REFERENCES public.barns (id) ON DELETE CASCADE,
  FOREIGN KEY (barn_id, instructor_id) REFERENCES public.barn_memberships (barn_id, id) ON DELETE SET NULL (instructor_id)
);

ALTER TABLE public.lesson_series ENABLE ROW LEVEL SECURITY;

-- lessons (pre-existing baseline table)
ALTER TABLE public.lessons ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE public.lessons ADD COLUMN cancellation_notes TEXT;
ALTER TABLE public.lessons ADD COLUMN series_id UUID;
ALTER TABLE public.lessons ADD CONSTRAINT lessons_series_id_fkey FOREIGN KEY (barn_id, series_id) REFERENCES public.lesson_series (barn_id, id);
ALTER TABLE public.lessons ADD CONSTRAINT lessons_series_id_lesson_at_key UNIQUE (series_id, lesson_at);
ALTER TABLE public.lessons ADD COLUMN instructor_cut NUMERIC NOT NULL DEFAULT 0 CHECK (instructor_cut >= 0);
-- payment_type is NOT dropped here — see release3_backfills.sql, which reads this
-- column (and agreement_charges.payment_type) before dropping both at the end.
ALTER TABLE public.lessons ALTER COLUMN fee SET NOT NULL;

-- lesson_riders (pre-existing baseline table)
ALTER TABLE public.lesson_riders ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE public.lesson_riders ADD COLUMN cancellation_notes TEXT;
ALTER TABLE public.lesson_riders
  ADD CONSTRAINT lesson_riders_barn_id_id_key UNIQUE (barn_id, id);

-- documents: reminder_date on all three tables, plus the trainer_documents ->
-- staff_documents rename (baseline created the table under its old name; the
-- rider_id/trainer_id -> barn_memberships FK swap for both tables is a real
-- backfill against pre-existing rows, so it lives in release3_backfills.sql)
ALTER TABLE public.horse_documents ADD COLUMN reminder_date DATE;
ALTER TABLE public.rider_documents ADD COLUMN reminder_date DATE;
ALTER TABLE public.trainer_documents ADD COLUMN reminder_date DATE;

ALTER TABLE public.trainer_documents RENAME TO staff_documents;
ALTER TRIGGER trainer_documents_set_updated_at ON public.staff_documents RENAME TO staff_documents_set_updated_at;
ALTER TABLE public.staff_documents RENAME CONSTRAINT trainer_documents_pkey TO staff_documents_pkey;
ALTER TABLE public.staff_documents RENAME CONSTRAINT trainer_documents_barn_id_id_key TO staff_documents_barn_id_id_key;
ALTER TABLE public.staff_documents RENAME CONSTRAINT trainer_documents_barn_id_fkey TO staff_documents_barn_id_fkey;
ALTER TABLE public.staff_documents RENAME CONSTRAINT trainer_documents_trainer_id_fkey TO staff_documents_trainer_id_fkey;

-- transactions (new table)
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
  -- At most one, not exactly one: each source FK uses ON DELETE SET NULL so a
  -- transaction outlives deletion of its source row, which nulls that one column.
  -- An exactly-one CHECK would reject that SET NULL update and block the delete
  -- entirely. Exactly-one at creation time is enforced by the writing RPCs.
  CHECK (
    (CASE WHEN lesson_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN lesson_rider_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN agreement_charge_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN expense_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  )
);

CREATE INDEX transactions_barn_id_idx ON public.transactions (barn_id);
CREATE UNIQUE INDEX transactions_lesson_fee_key
  ON public.transactions (lesson_id) WHERE kind = 'lesson_fee';
CREATE UNIQUE INDEX transactions_instructor_payout_key
  ON public.transactions (lesson_id) WHERE kind = 'instructor_payout';
CREATE UNIQUE INDEX transactions_expense_key
  ON public.transactions (expense_id) WHERE kind = 'expense';

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- seeded_accounts: dead code after #499 (managed-stub invite tokens replaced
-- the seed-account flow). Dropping the table also drops its RLS policies.
DROP TABLE public.seeded_accounts;
