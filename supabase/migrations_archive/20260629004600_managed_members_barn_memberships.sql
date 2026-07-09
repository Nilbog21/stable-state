-- Add profile_id as the single join key from barn_memberships to profiles.
-- Replaces the two-hop user_id → auth.users → profiles resolution.

-- Add nullable first so existing rows can be backfilled before adding NOT NULL.
ALTER TABLE barn_memberships ADD COLUMN profile_id UUID REFERENCES profiles(id);

-- Backfill from existing user_id → profiles join.
UPDATE barn_memberships bm
SET profile_id = p.id
FROM profiles p
WHERE p.user_id = bm.user_id;

-- Now enforce NOT NULL (all existing rows are backfilled).
ALTER TABLE barn_memberships ALTER COLUMN profile_id SET NOT NULL;

-- Make user_id nullable so manager-created managed members can exist without an auth account.
ALTER TABLE barn_memberships ALTER COLUMN user_id DROP NOT NULL;

-- Per-member invite token for claiming managed accounts.
-- Partial unique index: NULL tokens are not unique (most rows have no token).
ALTER TABLE barn_memberships ADD COLUMN invite_token UUID;
CREATE UNIQUE INDEX barn_memberships_invite_token_unique
  ON barn_memberships (invite_token) WHERE invite_token IS NOT NULL;
