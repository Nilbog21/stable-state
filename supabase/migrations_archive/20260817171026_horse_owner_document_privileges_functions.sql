-- #1547: a horse's owning member gets document write and lesson read on their own horse,
-- without needing a separate member_horse_privileges grant.
--
-- Both #997 helpers read member_horse_privileges and nothing else, so an owner scored 'none' /
-- false on their own horse and the horse detail page's Documents section was unreachable for them
-- entirely (found walking as a verified owner in the 2026-08-16 checklist run). Ownership already
-- implies write access to feed/medication notes (update_horse_notes, #1006) and to the photo
-- (update_horse_photo, #1003), which made the documents split an undocumented asymmetry rather
-- than a policy.
--
-- One new helper serves all three new call sites -- the two replacements below and
-- horse_documents_delete_ownership in the companion RLS migration -- rather than three copies of
-- the same join. SECURITY DEFINER for the same recursion-safety reason as auth_is_enrolled_rider:
-- it is called from policies on horse_documents and storage.objects, and reads horses and
-- barn_memberships, both of which carry policies of their own.
--
-- Role-blind by design, matching update_horse_notes'/update_horse_photo's owner branches: a
-- trainer or manager who owns the horse is admitted on the same basis as a rider. A horse with
-- owning_member_id IS NULL matches no row, so it returns false.
CREATE FUNCTION public.auth_is_horse_owner(p_horse_id uuid, p_barn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.horses h
    JOIN public.barn_memberships bm ON bm.id = h.owning_member_id
    WHERE h.id = p_horse_id AND h.barn_id = p_barn_id
      AND bm.user_id = auth.uid() AND bm.barn_id = p_barn_id AND bm.status = 'active'
  );
$$;

-- Ownership short-circuits to 'write', the top of the privilege ladder, so an owner needs no
-- privileges row at all; a non-owner keeps the original lookup unchanged. Body-only amendment,
-- so the #1359 storage policies (rider_horse_documents_select/_insert) and the two horse_documents
-- table policies that call this inherit the ownership branch with no edit of their own.
CREATE OR REPLACE FUNCTION public.auth_get_horse_document_privilege(p_horse_id uuid, p_barn_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.auth_is_horse_owner(p_horse_id, p_barn_id) THEN 'write'
    ELSE COALESCE(
      (SELECT mhp.document_privileges
       FROM public.barn_memberships bm
       JOIN public.member_horse_privileges mhp
         ON mhp.member_id = bm.id AND mhp.horse_id = p_horse_id AND mhp.barn_id = p_barn_id
       WHERE bm.user_id = auth.uid() AND bm.barn_id = p_barn_id AND bm.status = 'active'
       LIMIT 1),
      'none'
    )
  END;
$$;

-- Same blind spot, same fix: an owner sees their own horse's schedule (Upcoming Lessons on the
-- horse detail page, and the exhaustion figures get_horse_projected_exhaustion gates on this)
-- without a grant. set_horse_owner still elevates an existing grant row's lesson_read_privileges,
-- which is now bookkeeping in the Access table rather than the thing that confers access.
CREATE OR REPLACE FUNCTION public.auth_has_horse_lesson_read_privilege(p_horse_id uuid, p_barn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_is_horse_owner(p_horse_id, p_barn_id) OR EXISTS (
    SELECT 1 FROM public.barn_memberships bm
    JOIN public.member_horse_privileges mhp ON mhp.member_id = bm.id
    WHERE bm.user_id = auth.uid() AND bm.barn_id = p_barn_id AND bm.status = 'active'
      AND mhp.horse_id = p_horse_id AND mhp.barn_id = p_barn_id
      AND mhp.lesson_read_privileges = true
  );
$$;

-- Only the new function needs a pair: CREATE OR REPLACE preserves the existing ACL, so the two
-- amended helpers keep the grants 20260722222911 gave them (see check-function-grants.sh's header).
REVOKE ALL ON FUNCTION public.auth_is_horse_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_horse_owner(uuid, uuid) TO authenticated;
