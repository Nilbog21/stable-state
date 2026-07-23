ALTER TABLE public.barns ADD COLUMN schedule_buffer_minutes INT NOT NULL DEFAULT 30 CHECK (schedule_buffer_minutes >= 0);
