-- Normalize profiles email uniqueness to the form expected by the next migration.
-- Remote has a non-partial unique INDEX named profiles_email_unique; the next
-- migration (004557) expects a UNIQUE CONSTRAINT named profiles_email_key.
-- Drop the index and create the constraint so 004557 can proceed cleanly.
DROP INDEX IF EXISTS profiles_email_unique;
ALTER TABLE profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);
