-- Normalize profiles email uniqueness to the form expected by the next migration.
-- Remote has a UNIQUE CONSTRAINT named profiles_email_unique; the next
-- migration (004557) expects a UNIQUE CONSTRAINT named profiles_email_key.
-- Rename the constraint by dropping and recreating under the expected name.
ALTER TABLE profiles DROP CONSTRAINT profiles_email_unique;
ALTER TABLE profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);
