-- Per-barn horse registry
CREATE TABLE public.horses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-barn rider registry
CREATE TABLE public.riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lesson records
CREATE TABLE public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fee NUMERIC,
  lesson_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lesson ↔ horse junction (one exertion level per horse per lesson)
CREATE TABLE public.lesson_horses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  horse_id UUID NOT NULL REFERENCES public.horses(id) ON DELETE CASCADE,
  exertion_level SMALLINT NOT NULL DEFAULT 3 CHECK (exertion_level BETWEEN 1 AND 5),
  UNIQUE (lesson_id, horse_id)
);

-- Lesson ↔ rider junction
CREATE TABLE public.lesson_riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  UNIQUE (lesson_id, rider_id)
);
