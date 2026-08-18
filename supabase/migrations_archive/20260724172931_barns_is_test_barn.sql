-- #986 follow-up: mark barns created by seed-test-barn.sh so teardown-test-barn.ts can
-- refuse to delete a barn that isn't actually a synthetic test barn.
ALTER TABLE public.barns ADD COLUMN is_test_barn BOOLEAN NOT NULL DEFAULT false;
