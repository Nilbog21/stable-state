CREATE TABLE lesson_series (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id          UUID NOT NULL REFERENCES barns(id),
  instructor_id    UUID REFERENCES barn_memberships(id),
  fee              NUMERIC NOT NULL,
  lesson_type      lesson_type NOT NULL DEFAULT 'normal',
  jumping          BOOLEAN NOT NULL DEFAULT false,
  tier_name        TEXT NOT NULL DEFAULT 'Custom',
  horse_ids        UUID[] NOT NULL,
  exertion_levels  SMALLINT[] NOT NULL,
  rider_ids        UUID[] NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, id)
);

ALTER TABLE lessons
  ADD COLUMN series_id UUID,
  ADD CONSTRAINT lessons_series_id_fkey FOREIGN KEY (barn_id, series_id) REFERENCES lesson_series (barn_id, id);
