ALTER TABLE public.barns ADD COLUMN exhaustion_threshold_high INT NOT NULL DEFAULT 11;
ALTER TABLE public.barns ADD COLUMN exhaustion_threshold_moderate INT NOT NULL DEFAULT 5;
ALTER TABLE public.horses ADD COLUMN exhaustion_threshold_high INT;
ALTER TABLE public.horses ADD COLUMN exhaustion_threshold_moderate INT;
