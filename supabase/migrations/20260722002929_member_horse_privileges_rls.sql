-- #997: RLS for member_horse_privileges (manager-only CRUD, barn-scoped) and
-- new rider-privilege policies on horse_documents/lessons/lesson_horses/
-- lesson_riders granting access via the helper functions in the companion
-- functions migration. All new SELECT policies below are additive —
-- Postgres OR-combines multiple permissive policies for the same command,
-- so existing manager/trainer/enrolled-rider access is unchanged.

ALTER TABLE public.member_horse_privileges ENABLE ROW LEVEL SECURITY;

CREATE POLICY manager_all_member_horse_privileges ON public.member_horse_privileges
  FOR ALL TO authenticated
  USING (public.auth_is_barn_manager(barn_id))
  WITH CHECK (public.auth_is_barn_manager(barn_id));

-- horse_documents: privileged rider read/write, additive to the existing
-- manager/trainer policies.
CREATE POLICY horse_documents_select_privilege ON public.horse_documents
  FOR SELECT TO authenticated
  USING (public.auth_get_horse_document_privilege(horse_id, barn_id) IN ('read', 'write'));

CREATE POLICY horse_documents_insert_privilege ON public.horse_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_get_horse_document_privilege(horse_id, barn_id) = 'write');

-- lessons / lesson_horses / lesson_riders: privileged rider read, additive
-- to the existing staff/enrolled-rider SELECT policies.
CREATE POLICY lessons_select_horse_privilege ON public.lessons
  FOR SELECT TO authenticated
  USING (public.auth_lesson_has_privileged_horse(id, barn_id));

CREATE POLICY lesson_horses_select_horse_privilege ON public.lesson_horses
  FOR SELECT TO authenticated
  USING (public.auth_has_horse_lesson_read_privilege(horse_id, barn_id));

CREATE POLICY lesson_riders_select_horse_privilege ON public.lesson_riders
  FOR SELECT TO authenticated
  USING (public.auth_lesson_has_privileged_horse(lesson_id, barn_id));

REVOKE ALL ON FUNCTION public.auth_get_horse_document_privilege(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_get_horse_document_privilege(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_has_horse_lesson_read_privilege(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_has_horse_lesson_read_privilege(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_lesson_has_privileged_horse(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_lesson_has_privileged_horse(uuid, uuid) TO authenticated;
