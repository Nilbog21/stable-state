-- Consolidated baseline (#657): RLS enablement, policies, and grants
-- (including storage.objects, provisioned by the Supabase platform itself —
-- only the policies on it are ours to migrate).
-- See 20260629004610_baseline_schema.sql for context.

ALTER TABLE public.barn_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY barn_memberships_manager_approve ON public.barn_memberships FOR UPDATE TO authenticated USING (((status = 'pending'::text) AND public.auth_is_barn_manager(barn_id))) WITH CHECK ((status = 'active'::text));

CREATE POLICY barn_memberships_manager_delete ON public.barn_memberships FOR DELETE TO authenticated USING (public.auth_is_barn_manager(barn_id));

CREATE POLICY barn_memberships_manager_insert_managed ON public.barn_memberships FOR INSERT TO authenticated WITH CHECK (((user_id IS NULL) AND (invite_token IS NOT NULL) AND (status = 'active'::text) AND (role = 'rider'::text) AND public.auth_is_barn_manager(barn_id)));

CREATE POLICY barn_memberships_manager_read_barn ON public.barn_memberships FOR SELECT TO authenticated USING (public.auth_is_barn_manager(barn_id));

CREATE POLICY barn_memberships_manager_update_invite_token ON public.barn_memberships FOR UPDATE TO authenticated USING (((user_id IS NULL) AND (status = 'active'::text) AND public.auth_is_barn_manager(barn_id))) WITH CHECK (((user_id IS NULL) AND (status = 'active'::text) AND public.auth_is_barn_manager(barn_id)));

CREATE POLICY barn_memberships_read_own ON public.barn_memberships FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY barn_memberships_trainer_read_riders ON public.barn_memberships FOR SELECT TO authenticated USING (((role = 'rider'::text) AND (status = 'active'::text) AND public.auth_is_barn_trainer(barn_id)));

CREATE POLICY barn_memberships_write_own ON public.barn_memberships TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

ALTER TABLE public.barns ENABLE ROW LEVEL SECURITY;

CREATE POLICY barns_anon_read ON public.barns FOR SELECT TO anon USING (true);

CREATE POLICY barns_read_authenticated ON public.barns FOR SELECT TO authenticated USING (true);

ALTER TABLE public.horse_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.horses ENABLE ROW LEVEL SECURITY;

CREATE POLICY horses_manager_delete ON public.horses FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.barn_memberships mgr
  WHERE ((mgr.user_id = auth.uid()) AND (mgr.status = 'active'::text) AND (mgr.role = 'manager'::text) AND (mgr.barn_id = horses.barn_id)))));

CREATE POLICY horses_manager_insert ON public.horses FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.barn_memberships mgr
  WHERE ((mgr.user_id = auth.uid()) AND (mgr.status = 'active'::text) AND (mgr.role = 'manager'::text) AND (mgr.barn_id = horses.barn_id)))));

CREATE POLICY horses_manager_update ON public.horses FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.barn_memberships mgr
  WHERE ((mgr.user_id = auth.uid()) AND (mgr.status = 'active'::text) AND (mgr.role = 'manager'::text) AND (mgr.barn_id = horses.barn_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.barn_memberships mgr
  WHERE ((mgr.user_id = auth.uid()) AND (mgr.status = 'active'::text) AND (mgr.role = 'manager'::text) AND (mgr.barn_id = horses.barn_id)))));

CREATE POLICY horses_member_read ON public.horses FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.barn_memberships
  WHERE ((barn_memberships.user_id = auth.uid()) AND (barn_memberships.barn_id = horses.barn_id) AND (barn_memberships.status = 'active'::text)))));

ALTER TABLE public.lesson_horses ENABLE ROW LEVEL SECURITY;

CREATE POLICY lesson_horses_delete ON public.lesson_horses FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.barn_memberships mgr
  WHERE ((mgr.user_id = auth.uid()) AND (mgr.status = 'active'::text) AND (mgr.role = 'manager'::text) AND (mgr.barn_id = lesson_horses.barn_id)))));

CREATE POLICY lesson_horses_delete_trainer ON public.lesson_horses FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.lessons l
     JOIN public.barn_memberships bm ON ((bm.user_id = auth.uid())))
  WHERE ((l.id = lesson_horses.lesson_id) AND (l.barn_id = lesson_horses.barn_id) AND (l.instructor_id = auth.uid()) AND (bm.barn_id = lesson_horses.barn_id) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text)))));

CREATE POLICY lesson_horses_insert ON public.lesson_horses FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.barn_memberships
  WHERE ((barn_memberships.user_id = auth.uid()) AND (barn_memberships.barn_id = lesson_horses.barn_id) AND (barn_memberships.status = 'active'::text)))));

CREATE POLICY lesson_horses_select ON public.lesson_horses FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.barn_memberships
  WHERE ((barn_memberships.user_id = auth.uid()) AND (barn_memberships.barn_id = lesson_horses.barn_id) AND (barn_memberships.status = 'active'::text)))));

CREATE POLICY lesson_horses_update ON public.lesson_horses FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.barn_memberships
  WHERE ((barn_memberships.user_id = auth.uid()) AND (barn_memberships.barn_id = lesson_horses.barn_id) AND (barn_memberships.status = 'active'::text) AND (barn_memberships.role = ANY (ARRAY['manager'::text, 'trainer'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.barn_memberships
  WHERE ((barn_memberships.user_id = auth.uid()) AND (barn_memberships.barn_id = lesson_horses.barn_id) AND (barn_memberships.status = 'active'::text) AND (barn_memberships.role = ANY (ARRAY['manager'::text, 'trainer'::text]))))));

ALTER TABLE public.lesson_riders ENABLE ROW LEVEL SECURITY;

CREATE POLICY lesson_riders_delete ON public.lesson_riders FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.barn_memberships mgr
  WHERE ((mgr.user_id = auth.uid()) AND (mgr.status = 'active'::text) AND (mgr.role = 'manager'::text) AND (mgr.barn_id = lesson_riders.barn_id)))));

CREATE POLICY lesson_riders_delete_trainer ON public.lesson_riders FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.lessons l
     JOIN public.barn_memberships bm ON ((bm.user_id = auth.uid())))
  WHERE ((l.id = lesson_riders.lesson_id) AND (l.barn_id = lesson_riders.barn_id) AND (l.instructor_id = auth.uid()) AND (bm.barn_id = lesson_riders.barn_id) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text)))));

CREATE POLICY lesson_riders_insert ON public.lesson_riders FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.barn_memberships
  WHERE ((barn_memberships.user_id = auth.uid()) AND (barn_memberships.barn_id = lesson_riders.barn_id) AND (barn_memberships.status = 'active'::text)))));

CREATE POLICY lesson_riders_select ON public.lesson_riders FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.barn_memberships
  WHERE ((barn_memberships.user_id = auth.uid()) AND (barn_memberships.barn_id = lesson_riders.barn_id) AND (barn_memberships.status = 'active'::text)))));

CREATE POLICY lesson_riders_update ON public.lesson_riders FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.barn_memberships
  WHERE ((barn_memberships.user_id = auth.uid()) AND (barn_memberships.barn_id = lesson_riders.barn_id) AND (barn_memberships.status = 'active'::text) AND (barn_memberships.role = ANY (ARRAY['manager'::text, 'trainer'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.barn_memberships
  WHERE ((barn_memberships.user_id = auth.uid()) AND (barn_memberships.barn_id = lesson_riders.barn_id) AND (barn_memberships.status = 'active'::text) AND (barn_memberships.role = ANY (ARRAY['manager'::text, 'trainer'::text]))))));

ALTER TABLE public.lesson_tiers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY lessons_delete ON public.lessons FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.barn_memberships mgr
  WHERE ((mgr.user_id = auth.uid()) AND (mgr.status = 'active'::text) AND (mgr.role = 'manager'::text) AND (mgr.barn_id = lessons.barn_id)))));

CREATE POLICY lessons_insert ON public.lessons FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.barn_memberships
  WHERE ((barn_memberships.user_id = auth.uid()) AND (barn_memberships.barn_id = lessons.barn_id) AND (barn_memberships.status = 'active'::text)))));

CREATE POLICY lessons_select ON public.lessons FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.barn_memberships
  WHERE ((barn_memberships.user_id = auth.uid()) AND (barn_memberships.barn_id = lessons.barn_id) AND (barn_memberships.status = 'active'::text)))));

CREATE POLICY lessons_update ON public.lessons FOR UPDATE TO authenticated USING (public.auth_is_barn_manager(barn_id)) WITH CHECK (public.auth_is_barn_manager(barn_id));

CREATE POLICY lessons_update_trainer ON public.lessons FOR UPDATE TO authenticated USING (((instructor_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = lessons.barn_id) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text)))))) WITH CHECK (((instructor_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = lessons.barn_id) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text))))));

CREATE POLICY manager_all_horse_documents ON public.horse_documents TO authenticated USING (public.auth_is_barn_manager(barn_id)) WITH CHECK (public.auth_is_barn_manager(barn_id));

CREATE POLICY manager_all_lesson_tiers ON public.lesson_tiers TO authenticated USING (public.auth_is_barn_manager(barn_id)) WITH CHECK (public.auth_is_barn_manager(barn_id));

CREATE POLICY manager_all_rider_documents ON public.rider_documents TO authenticated USING (public.auth_is_barn_manager(barn_id)) WITH CHECK (public.auth_is_barn_manager(barn_id));

CREATE POLICY manager_all_trainer_documents ON public.trainer_documents TO authenticated USING (public.auth_is_barn_manager(barn_id)) WITH CHECK (public.auth_is_barn_manager(barn_id));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_insert_authenticated ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_barn_members_read ON public.profiles FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM (public.barn_memberships actor
     JOIN public.barn_memberships target ON ((target.barn_id = actor.barn_id)))
  WHERE ((actor.user_id = auth.uid()) AND (actor.status = 'active'::text) AND (actor.role = ANY (ARRAY['manager'::text, 'trainer'::text, 'rider'::text])) AND (target.profile_id = profiles.id))))));

CREATE POLICY profiles_manager_insert_managed ON public.profiles FOR INSERT TO authenticated WITH CHECK (((is_managed = true) AND (user_id IS NULL) AND public.auth_is_any_barn_manager()));

CREATE POLICY profiles_manager_read ON public.profiles FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM (public.barn_memberships actor
     JOIN public.barn_memberships target ON ((target.barn_id = actor.barn_id)))
  WHERE ((actor.user_id = auth.uid()) AND (actor.status = 'active'::text) AND (actor.role = 'manager'::text) AND (target.profile_id = profiles.id))))));

CREATE POLICY profiles_manager_update ON public.profiles FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.barn_memberships actor
     JOIN public.barn_memberships target ON ((target.barn_id = actor.barn_id)))
  WHERE ((actor.user_id = auth.uid()) AND (actor.status = 'active'::text) AND (actor.role = 'manager'::text) AND (target.profile_id = profiles.id) AND (target.status = 'active'::text))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.barn_memberships actor
     JOIN public.barn_memberships target ON ((target.barn_id = actor.barn_id)))
  WHERE ((actor.user_id = auth.uid()) AND (actor.status = 'active'::text) AND (actor.role = 'manager'::text) AND (target.profile_id = profiles.id) AND (target.status = 'active'::text)))) AND (EXISTS ( SELECT 1
   FROM public.auth_get_profile_immutable_fields(profiles.id) existing(user_id, email, first_name, last_name, created_at)
  WHERE ((NOT (existing.user_id IS DISTINCT FROM profiles.user_id)) AND (NOT (existing.email IS DISTINCT FROM profiles.email)) AND (existing.first_name = profiles.first_name) AND (existing.last_name = profiles.last_name) AND (existing.created_at = profiles.created_at))))));

CREATE POLICY profiles_own_delete ON public.profiles FOR DELETE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY profiles_own_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

CREATE POLICY profiles_own_update ON public.profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY rider_delete_own_rider_documents ON public.rider_documents FOR DELETE TO authenticated USING (((rider_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = rider_documents.barn_id) AND (bm.role = 'rider'::text) AND (bm.status = 'active'::text))))));

ALTER TABLE public.rider_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY rider_insert_own_rider_documents ON public.rider_documents FOR INSERT TO authenticated WITH CHECK (((rider_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = rider_documents.barn_id) AND (bm.role = 'rider'::text) AND (bm.status = 'active'::text))))));

CREATE POLICY rider_select_own_rider_documents ON public.rider_documents FOR SELECT TO authenticated USING (((rider_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = rider_documents.barn_id) AND (bm.role = 'rider'::text) AND (bm.status = 'active'::text))))));

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY roles_read_all ON public.roles FOR SELECT USING (true);

ALTER TABLE public.seeded_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY seeded_accounts_delete_own ON public.seeded_accounts FOR DELETE TO authenticated USING ((email = auth.email()));

CREATE POLICY seeded_accounts_select_own ON public.seeded_accounts FOR SELECT TO authenticated USING ((email = auth.email()));

CREATE POLICY trainer_delete_own_trainer_documents ON public.trainer_documents FOR DELETE TO authenticated USING (((trainer_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = trainer_documents.barn_id) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text))))));

ALTER TABLE public.trainer_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY trainer_insert_horse_documents ON public.horse_documents FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = horse_documents.barn_id) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text)))));

CREATE POLICY trainer_insert_own_trainer_documents ON public.trainer_documents FOR INSERT TO authenticated WITH CHECK (((trainer_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = trainer_documents.barn_id) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text))))));

CREATE POLICY trainer_select_horse_documents ON public.horse_documents FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = horse_documents.barn_id) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text)))));

CREATE POLICY trainer_select_lesson_tiers ON public.lesson_tiers FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = lesson_tiers.barn_id) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text)))));

CREATE POLICY trainer_select_own_trainer_documents ON public.trainer_documents FOR SELECT TO authenticated USING (((trainer_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = trainer_documents.barn_id) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text))))));

CREATE POLICY trainer_select_rider_documents ON public.rider_documents FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = rider_documents.barn_id) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text)))));

REVOKE ALL ON FUNCTION public.claim_managed_member(p_token uuid, p_user_id uuid, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_managed_member(p_token uuid, p_user_id uuid, p_email text) TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.lessons TO authenticated;
GRANT ALL ON TABLE public.lessons TO service_role;

GRANT ALL ON FUNCTION public.create_lesson_with_participants(p_barn_id uuid, p_instructor_id uuid, p_lesson_at timestamp with time zone, p_fee numeric, p_horse_ids uuid[], p_exertion_levels integer[], p_rider_ids uuid[], p_lesson_type public.lesson_type, p_jumping boolean, p_tier_name text, p_payment_type public.payment_type_enum) TO authenticated;

REVOKE ALL ON FUNCTION public.create_managed_member(p_barn_id uuid, p_first_name text, p_last_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_managed_member(p_barn_id uuid, p_first_name text, p_last_name text) TO authenticated;

GRANT ALL ON FUNCTION public.get_horse_exertion_summary(p_barn_id uuid, p_since timestamp with time zone) TO authenticated;

REVOKE ALL ON FUNCTION public.set_can_instruct(p_membership_id uuid, p_barn_id uuid, p_value boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_can_instruct(p_membership_id uuid, p_barn_id uuid, p_value boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.teardown_all_lesson_data() FROM PUBLIC;
GRANT ALL ON FUNCTION public.teardown_all_lesson_data() TO service_role;

REVOKE ALL ON FUNCTION public.teardown_dev_barn_lessons(p_barn_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.teardown_dev_barn_lessons(p_barn_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.update_lesson_with_participants(p_lesson_id uuid, p_barn_id uuid, p_lesson_at timestamp with time zone, p_instructor_id uuid, p_fee numeric, p_lesson_type public.lesson_type, p_jumping boolean, p_payment_type public.payment_type_enum, p_tier_name text, p_horse_ids uuid[], p_exertion_levels integer[], p_rider_ids uuid[]) TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.barn_memberships TO authenticated;
GRANT ALL ON TABLE public.barn_memberships TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.barns TO authenticated;
GRANT SELECT ON TABLE public.barns TO anon;
GRANT ALL ON TABLE public.barns TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.horse_documents TO authenticated;
GRANT ALL ON TABLE public.horse_documents TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.horses TO authenticated;
GRANT ALL ON TABLE public.horses TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.lesson_horses TO authenticated;
GRANT ALL ON TABLE public.lesson_horses TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.lesson_riders TO authenticated;
GRANT ALL ON TABLE public.lesson_riders TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.lesson_tiers TO authenticated;
GRANT ALL ON TABLE public.lesson_tiers TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.rider_documents TO authenticated;
GRANT ALL ON TABLE public.rider_documents TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.roles TO authenticated;
GRANT SELECT ON TABLE public.roles TO anon;
GRANT ALL ON TABLE public.roles TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.seeded_accounts TO authenticated;
GRANT ALL ON TABLE public.seeded_accounts TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.trainer_documents TO authenticated;
GRANT ALL ON TABLE public.trainer_documents TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- storage.objects (table/bucket + RLS enablement provisioned by Supabase; only policies are ours)
CREATE POLICY manager_documents_all ON storage.objects TO authenticated USING (((bucket_id = 'documents'::text) AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid))) WITH CHECK (((bucket_id = 'documents'::text) AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)));

CREATE POLICY rider_own_documents_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'riders'::text) AND ((storage.foldername(name))[3] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = ((storage.foldername(objects.name))[1])::uuid) AND (bm.role = 'rider'::text) AND (bm.status = 'active'::text))))));

CREATE POLICY rider_own_documents_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'riders'::text) AND ((storage.foldername(name))[3] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = ((storage.foldername(objects.name))[1])::uuid) AND (bm.role = 'rider'::text) AND (bm.status = 'active'::text))))));

CREATE POLICY rider_own_documents_select ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'riders'::text) AND ((storage.foldername(name))[3] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = ((storage.foldername(objects.name))[1])::uuid) AND (bm.role = 'rider'::text) AND (bm.status = 'active'::text))))));

CREATE POLICY trainer_horse_documents_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'horses'::text) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = ((storage.foldername(objects.name))[1])::uuid) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text))))));

CREATE POLICY trainer_horse_documents_select ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'horses'::text) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = ((storage.foldername(objects.name))[1])::uuid) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text))))));

CREATE POLICY trainer_own_documents_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'trainers'::text) AND ((storage.foldername(name))[3] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = ((storage.foldername(objects.name))[1])::uuid) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text))))));

CREATE POLICY trainer_own_documents_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'trainers'::text) AND ((storage.foldername(name))[3] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = ((storage.foldername(objects.name))[1])::uuid) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text))))));

CREATE POLICY trainer_own_documents_select ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'trainers'::text) AND ((storage.foldername(name))[3] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = ((storage.foldername(objects.name))[1])::uuid) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text))))));

CREATE POLICY trainer_rider_documents_select ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'riders'::text) AND (EXISTS ( SELECT 1
   FROM public.barn_memberships bm
  WHERE ((bm.user_id = auth.uid()) AND (bm.barn_id = ((storage.foldername(objects.name))[1])::uuid) AND (bm.role = 'trainer'::text) AND (bm.status = 'active'::text))))));
