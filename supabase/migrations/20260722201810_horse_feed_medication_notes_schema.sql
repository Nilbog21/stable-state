-- #1005: free-form feed/medication notes on a horse's record
ALTER TABLE public.horses ADD COLUMN feed_notes TEXT;
ALTER TABLE public.horses ADD COLUMN medication_notes TEXT;
