-- #1018: personalized .ics calendar export — per-membership feed token, mirrors invite_token.
ALTER TABLE public.barn_memberships ADD COLUMN calendar_feed_token TEXT;

CREATE UNIQUE INDEX barn_memberships_calendar_feed_token_unique
  ON public.barn_memberships (calendar_feed_token) WHERE (calendar_feed_token IS NOT NULL);
