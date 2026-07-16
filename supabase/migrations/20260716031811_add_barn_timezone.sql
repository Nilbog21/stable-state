-- #955: barns.timezone lets server-side comparisons that run with no request/viewer
-- context (cron jobs, dashboard SSR — e.g. "is this planned expense past due") resolve
-- against the barn's own timezone instead of guessing. Display of real instants
-- (lesson_at) is unaffected — that stays viewer-local per #935's existing convention.
ALTER TABLE barns ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/New_York';
