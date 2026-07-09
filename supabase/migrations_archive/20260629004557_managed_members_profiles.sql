-- Allow profiles to exist without an email (managed members have no email until they claim).
-- Replace NOT NULL unique constraint with a partial unique index (NULL is not unique).
ALTER TABLE profiles ALTER COLUMN email DROP NOT NULL;
ALTER TABLE profiles DROP CONSTRAINT profiles_email_key;
CREATE UNIQUE INDEX profiles_email_unique ON profiles (email) WHERE email IS NOT NULL;

-- Flag distinguishing manager-created stub profiles from real sign-up profiles.
ALTER TABLE profiles ADD COLUMN is_managed BOOLEAN NOT NULL DEFAULT false;
