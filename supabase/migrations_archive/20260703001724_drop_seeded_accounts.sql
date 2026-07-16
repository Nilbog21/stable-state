-- seeded_accounts is dead code after #499 (managed-stub invite tokens replaced the seed-account flow).
-- Dropping the table also drops its RLS policies.
DROP TABLE public.seeded_accounts;
