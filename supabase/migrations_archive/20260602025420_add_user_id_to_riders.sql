ALTER TABLE public.riders ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX riders_barn_user_unique ON public.riders(barn_id, user_id) WHERE user_id IS NOT NULL;
