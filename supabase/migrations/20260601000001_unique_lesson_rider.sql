-- Enforce one rider per lesson: separate lessons are created per rider/fee combination
ALTER TABLE public.lesson_riders ADD CONSTRAINT lesson_riders_lesson_id_unique UNIQUE (lesson_id);
