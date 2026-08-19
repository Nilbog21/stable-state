-- release-4 consolidated schema (#1629). Squashes the DDL of the 62 migrations
-- 20260722201810-20260818012511, archived under supabase/migrations_archive/. A delta on top
-- of the #657 baseline and the #972 release-3 set, not a from-scratch snapshot -- these tables
-- carry real rows. Row-migrating DML and the ALTERs that depend on it live in the companion
-- ..._release4_backfills.sql; functions in ..._release4_functions.sql; policies and grants in
-- ..._release4_rls.sql.
--
-- Columns are added in the order the squashed migrations added them. That is not cosmetic:
-- a table's column order is part of what `pg_dump` renders, so reordering them here would
-- make this set inequivalent to the history it replaces.

-- ===========================================================================
-- #1005: free-form feed/medication notes on a horse's record
ALTER TABLE public.horses ADD COLUMN feed_notes TEXT;
ALTER TABLE public.horses ADD COLUMN medication_notes TEXT;

ALTER TABLE public.horses ADD COLUMN photo_path text;

ALTER TABLE public.barns ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;

-- #997: per-horse ownership and per-member privilege grants. member_horse_privileges holds
-- the manager-granted document/lesson-read privileges; horses.owning_member_id, below, is the
-- horse's owner. The two were decoupled when this table was introduced and are not any more:
-- since #1547 ownership confers document write and lesson read on its own, through
-- auth_is_horse_owner, with no privileges row required.
CREATE TABLE public.member_horse_privileges (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id                UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  member_id              UUID NOT NULL,
  horse_id               UUID NOT NULL,
  document_privileges    TEXT NOT NULL DEFAULT 'none' CHECK (document_privileges IN ('none', 'read', 'write')),
  lesson_read_privileges BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, member_id, horse_id),
  FOREIGN KEY (barn_id, member_id) REFERENCES public.barn_memberships (barn_id, id) ON DELETE CASCADE,
  FOREIGN KEY (barn_id, horse_id) REFERENCES public.horses (barn_id, id) ON DELETE CASCADE
);


-- owning_member_id: the horse's owner. Added nullable here and made NOT NULL in the companion
-- backfills file, which is where the rows needing one are filled in (#1549). ON DELETE
-- RESTRICT rather than the column-list SET NULL it was born with: with the column NOT NULL,
-- SET NULL is unreachable by construction -- it could only ever raise, naming a constraint
-- nobody deleting a member would connect to horses. `removeMemberAction` pre-checks and
-- refuses with the horses named, so this is the backstop for a direct DB delete.
--
-- Safe against the two teardown paths: `teardownBarnData`/`teardownAllData`
-- (src/lib/db/service-role.ts) both delete horses before barn_memberships. Deleting a `barns`
-- row while its horses still exist relies on the order Postgres happens to cascade in and can
-- now trip this -- direct DB access only; nothing in the app deletes a barn.
ALTER TABLE public.horses ADD COLUMN owning_member_id UUID;
ALTER TABLE public.horses
  ADD CONSTRAINT horses_barn_id_owning_member_id_fkey
  FOREIGN KEY (barn_id, owning_member_id) REFERENCES public.barn_memberships (barn_id, id)
  ON DELETE RESTRICT;

-- ===========================================================================
-- #1013: getScheduleForRange range-query performance. Composite (not single-column,
-- unlike transactions_barn_id_idx) since this DAL always filters barn_id AND
-- range-filters the date column together in the same query. The appointments half of this
-- pair is created with the rest of the #1148 rename at the bottom of this file, under its
-- post-rename name.
CREATE INDEX lessons_barn_id_lesson_at_idx ON public.lessons (barn_id, lesson_at);

-- ===========================================================================
-- #1001: optional registered name (e.g. Coggins-report name), distinct from
-- the barn name used as the stall/roster identifier
ALTER TABLE public.horses ADD COLUMN registered_name TEXT;

-- #1014: barn_events holds ad-hoc calendar entries that aren't a lesson or an
-- expense (e.g. a costume party). visible_to_roles governs both dashboard
-- visibility and which personalized .ics feeds include it -- get_calendar_feed
-- in the companion functions file filters on it (#1018). Defaults to everyone
-- so the creator only narrows scope.

CREATE TABLE public.barn_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id          UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  event_at         TIMESTAMPTZ NOT NULL,
  notes            TEXT,
  visible_to_roles TEXT[] NOT NULL DEFAULT ARRAY['manager','trainer','rider'],
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, id)
);

-- #1004: single overwritable profile picture, mirrors horses.photo_path (#1002).
ALTER TABLE public.profiles ADD COLUMN photo_path text;

-- #1003: who last uploaded the horse's photo, which update_horse_photo reads to keep a
-- manager from overwriting an owner's upload. Composite (barn_id, id) FK from the start --
-- the bare single-column form it was born with couldn't stop a cross-barn membership id
-- being stored, and every other membership-referencing column uses this shape.
ALTER TABLE public.horses ADD COLUMN photo_uploaded_by UUID;
ALTER TABLE public.horses
  ADD CONSTRAINT horses_barn_id_photo_uploaded_by_fkey
  FOREIGN KEY (barn_id, photo_uploaded_by) REFERENCES public.barn_memberships (barn_id, id)
  ON DELETE SET NULL (photo_uploaded_by);

ALTER TABLE public.barns ADD COLUMN schedule_buffer_minutes INT NOT NULL DEFAULT 30 CHECK (schedule_buffer_minutes >= 0);

-- #1018: personalized .ics calendar export — per-membership feed token, mirrors invite_token.
ALTER TABLE public.barn_memberships ADD COLUMN calendar_feed_token TEXT;

CREATE UNIQUE INDEX barn_memberships_calendar_feed_token_unique
  ON public.barn_memberships (calendar_feed_token) WHERE (calendar_feed_token IS NOT NULL);

-- #986 follow-up: mark barns created by seed-test-barn.sh so teardown-test-barn.ts can
-- refuse to delete a barn that isn't actually a synthetic test barn.
ALTER TABLE public.barns ADD COLUMN is_test_barn BOOLEAN NOT NULL DEFAULT false;

-- ===========================================================================
-- #1148: horse_expenses/expense_horses become appointments/appointment_horses, and the money
-- columns move to a new appointment_costs table. The `ALTER INDEX ... RENAME` this migration
-- carried is gone -- the index is created below under the name it ends up with.
ALTER TABLE public.horse_expenses RENAME TO appointments;
ALTER TABLE public.expense_horses RENAME TO appointment_horses;
ALTER TABLE public.appointment_horses RENAME COLUMN expense_id TO appointment_id;

-- ALTER TABLE ... RENAME follows neither triggers nor indexes, so both would otherwise keep
-- their horse_expenses_* names and read as leftovers of a dropped table. The auto-named
-- PK/UNIQUE constraints are deliberately left alone -- nothing in this repo references a
-- constraint by name.
ALTER TRIGGER horse_expenses_set_updated_at ON public.appointments
  RENAME TO appointments_set_updated_at;

CREATE INDEX appointments_barn_id_expense_date_idx ON public.appointments (barn_id, expense_date, expense_time);

-- One row per appointment that has a cost. `amount` is NOT NULL on purpose: the absence of a
-- row is then the single unambiguous encoding of "not priced yet", which is exactly what the
-- old nullable horse_expenses.amount meant. payment_type stays nullable -- a known cost that
-- hasn't been paid. The composite FK matches the repo's cross-barn-integrity convention.
CREATE TABLE public.appointment_costs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id        UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  payment_type   public.payment_type_enum,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (appointment_id),
  FOREIGN KEY (barn_id, appointment_id) REFERENCES public.appointments (barn_id, id) ON DELETE CASCADE
);

CREATE TRIGGER appointment_costs_set_updated_at
  BEFORE UPDATE ON public.appointment_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- transactions.expense_id keeps its name (every ledger reader and the
-- transactions_expense_key partial unique index are keyed on it); only its FK target
-- follows the rename, which Postgres does on its own.

