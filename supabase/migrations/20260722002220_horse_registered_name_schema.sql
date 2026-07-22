-- #1001: optional registered name (e.g. Coggins-report name), distinct from
-- the barn name used as the stall/roster identifier
ALTER TABLE public.horses ADD COLUMN registered_name TEXT;
