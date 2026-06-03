-- Correct admin seeded account: barn_id must be NULL for global admin scope
UPDATE public.seeded_accounts
SET barn_id = NULL
WHERE id = (SELECT id FROM public.seeded_accounts WHERE role = 'admin' LIMIT 1);
