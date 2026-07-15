ALTER POLICY "manager_all_trainer_documents" ON public.staff_documents RENAME TO "manager_all_staff_documents";
ALTER POLICY "trainer_select_own_trainer_documents" ON public.staff_documents RENAME TO "trainer_select_own_staff_documents";
ALTER POLICY "trainer_insert_own_trainer_documents" ON public.staff_documents RENAME TO "trainer_insert_own_staff_documents";
ALTER POLICY "trainer_delete_own_trainer_documents" ON public.staff_documents RENAME TO "trainer_delete_own_staff_documents";
