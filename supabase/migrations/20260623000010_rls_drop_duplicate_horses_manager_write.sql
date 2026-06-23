-- Migration 20260623000005 erroneously created a "horses_manager_write" FOR ALL policy
-- on top of the three granular policies (horses_manager_insert/update/delete) that have
-- been in effect since 20260603000001. Drop the duplicate; the granular policies suffice.
DROP POLICY IF EXISTS "horses_manager_write" ON public.horses;
