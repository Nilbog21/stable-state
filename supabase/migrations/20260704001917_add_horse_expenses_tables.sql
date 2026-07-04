CREATE TABLE public.horse_expenses (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id                UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  expense_date           DATE NOT NULL,
  expense_time           TIME,
  amount                 NUMERIC(10,2),
  recipient              TEXT NOT NULL,
  expense_type           TEXT NOT NULL DEFAULT 'Unspecified',
  notes                  TEXT,
  applies_to_all_horses  BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, id)
);

CREATE TRIGGER horse_expenses_set_updated_at
  BEFORE UPDATE ON public.horse_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.horse_expenses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.expense_horses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id    UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL,
  horse_id   UUID NOT NULL,
  UNIQUE (expense_id, horse_id),
  FOREIGN KEY (barn_id, expense_id) REFERENCES public.horse_expenses (barn_id, id) ON DELETE CASCADE,
  FOREIGN KEY (barn_id, horse_id) REFERENCES public.horses (barn_id, id) ON DELETE CASCADE
);

ALTER TABLE public.expense_horses ENABLE ROW LEVEL SECURITY;
