-- #1014: barn_events holds ad-hoc calendar entries that aren't a lesson or an
-- expense (e.g. a costume party). visible_to_roles governs both dashboard
-- visibility and which personalized .ics feeds include it (future work) --
-- defaults to everyone so the creator only narrows scope.

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
