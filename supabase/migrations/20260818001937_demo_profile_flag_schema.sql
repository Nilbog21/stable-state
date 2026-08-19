-- #1641: `profiles.is_demo` marks the shared `/demo` account, so `claim_managed_member` can
-- refuse to bind a real barn's invite stub to it. `/demo` signs every visitor in as one shared
-- account with an ordinary site-wide session, and until this column there was nothing at the DB
-- layer that could tell that session apart from a real user's.
--
-- Written only by service-role callers (`scripts/setup-demo-user.ts` at bootstrap,
-- `createOrResumeDemoBarn` self-healingly on the first `/demo` visit after deploy). The
-- companion RLS migration pins it against a self-update, so the flagged account cannot clear
-- its own flag with the anon key.
ALTER TABLE public.profiles ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;
