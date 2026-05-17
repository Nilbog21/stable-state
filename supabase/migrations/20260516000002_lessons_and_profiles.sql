-- Trigger function to keep updated_at current
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Per-barn horse registry
CREATE TABLE public.horses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, id)
);

CREATE TRIGGER horses_set_updated_at
  BEFORE UPDATE ON public.horses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Per-barn rider registry
CREATE TABLE public.riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, id)
);

CREATE TRIGGER riders_set_updated_at
  BEFORE UPDATE ON public.riders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lesson records
CREATE TABLE public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fee NUMERIC,
  lesson_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, id)
);

-- Lesson ↔ horse junction
-- barn_id on this table plus composite FKs guarantee the horse belongs to the
-- same barn as the lesson at the DB level (no application-layer check needed).
CREATE TABLE public.lesson_horses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL,
  horse_id UUID NOT NULL,
  exertion_level SMALLINT NOT NULL DEFAULT 3 CHECK (exertion_level BETWEEN 1 AND 5),
  UNIQUE (lesson_id, horse_id),
  FOREIGN KEY (barn_id, lesson_id) REFERENCES public.lessons(barn_id, id) ON DELETE CASCADE,
  FOREIGN KEY (barn_id, horse_id) REFERENCES public.horses(barn_id, id) ON DELETE CASCADE
);

-- Lesson ↔ rider junction (same cross-barn integrity pattern)
CREATE TABLE public.lesson_riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL,
  rider_id UUID NOT NULL,
  UNIQUE (lesson_id, rider_id),
  FOREIGN KEY (barn_id, lesson_id) REFERENCES public.lessons(barn_id, id) ON DELETE CASCADE,
  FOREIGN KEY (barn_id, rider_id) REFERENCES public.riders(barn_id, id) ON DELETE CASCADE
);

-- Row Level Security: all five tables are scoped to active barn members
ALTER TABLE public.horses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "horses_barn_member" ON public.horses
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = horses.barn_id AND status = 'active'
  ));

ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "riders_barn_member" ON public.riders
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = riders.barn_id AND status = 'active'
  ));

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lessons_barn_member" ON public.lessons
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = lessons.barn_id AND status = 'active'
  ));

ALTER TABLE public.lesson_horses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lesson_horses_barn_member" ON public.lesson_horses
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = lesson_horses.barn_id AND status = 'active'
  ));

ALTER TABLE public.lesson_riders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lesson_riders_barn_member" ON public.lesson_riders
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = lesson_riders.barn_id AND status = 'active'
  ));

-- User profile (first/last name at the user level, not per-barn)
CREATE TABLE public.profiles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_own" ON public.profiles
  FOR ALL USING (auth.uid() = user_id);
