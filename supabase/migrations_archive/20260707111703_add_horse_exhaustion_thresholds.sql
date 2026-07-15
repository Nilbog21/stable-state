ALTER TABLE public.barns ADD COLUMN exhaustion_threshold_high INT NOT NULL DEFAULT 11 CHECK (exhaustion_threshold_high >= 0);
ALTER TABLE public.barns ADD COLUMN exhaustion_threshold_moderate INT NOT NULL DEFAULT 5 CHECK (exhaustion_threshold_moderate >= 0);
ALTER TABLE public.barns ADD CONSTRAINT barns_exhaustion_threshold_order CHECK (exhaustion_threshold_moderate < exhaustion_threshold_high);

ALTER TABLE public.horses ADD COLUMN exhaustion_threshold_high INT CHECK (exhaustion_threshold_high >= 0);
ALTER TABLE public.horses ADD COLUMN exhaustion_threshold_moderate INT CHECK (exhaustion_threshold_moderate >= 0);
ALTER TABLE public.horses ADD CONSTRAINT horses_exhaustion_threshold_order
  CHECK (exhaustion_threshold_moderate IS NULL OR exhaustion_threshold_high IS NULL OR exhaustion_threshold_moderate < exhaustion_threshold_high);
