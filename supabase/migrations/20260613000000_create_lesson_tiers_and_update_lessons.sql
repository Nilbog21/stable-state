CREATE TABLE lesson_tiers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id     uuid NOT NULL REFERENCES barns(id),
  name        TEXT NOT NULL,
  price       NUMERIC(10,2),
  is_default  BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lessons
  ADD COLUMN tier_name TEXT NOT NULL DEFAULT 'Custom';

ALTER TABLE barn_memberships
  DROP COLUMN default_fee;
