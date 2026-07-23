-- #997: foundation for per-horse ownership and per-member privilege grants.
-- member_horse_privileges holds manager-granted document/lesson-read privileges
-- per (member, horse); horses.owning_member_id is a separate, simpler
-- display/contact concept (single nullable owner), decoupled from privileges.

CREATE TABLE public.member_horse_privileges (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id                UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  member_id              UUID NOT NULL,
  horse_id               UUID NOT NULL,
  document_privileges    TEXT NOT NULL DEFAULT 'none' CHECK (document_privileges IN ('none', 'read', 'write')),
  lesson_read_privileges BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, member_id, horse_id),
  FOREIGN KEY (barn_id, member_id) REFERENCES public.barn_memberships (barn_id, id) ON DELETE CASCADE,
  FOREIGN KEY (barn_id, horse_id) REFERENCES public.horses (barn_id, id) ON DELETE CASCADE
);

-- owning_member_id: display/contact-only "owner" of a horse, independent of
-- the privileges table above. Column-list ON DELETE SET NULL mirrors
-- lessons.instructor_id's composite-FK pattern (barn_id must survive).
ALTER TABLE public.horses ADD COLUMN owning_member_id UUID;
ALTER TABLE public.horses
  ADD CONSTRAINT horses_barn_id_owning_member_id_fkey
  FOREIGN KEY (barn_id, owning_member_id) REFERENCES public.barn_memberships (barn_id, id)
  ON DELETE SET NULL (owning_member_id);
