ALTER TABLE public.barns ADD COLUMN instructor_cut NUMERIC NOT NULL DEFAULT 25 CHECK (instructor_cut >= 0);
