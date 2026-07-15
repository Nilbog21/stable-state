CREATE TYPE agreement_kind AS ENUM ('lease', 'board');
CREATE TYPE agreement_cadence AS ENUM ('one_time', 'monthly');

CREATE TABLE public.agreements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id     UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  rider_id    UUID NOT NULL,
  horse_id    UUID NOT NULL,
  fee         NUMERIC NOT NULL,
  kind        agreement_kind NOT NULL DEFAULT 'lease',
  cadence     agreement_cadence NOT NULL,
  start_date  DATE NOT NULL DEFAULT current_date,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, id),
  FOREIGN KEY (barn_id, rider_id) REFERENCES public.barn_memberships (barn_id, id) ON DELETE CASCADE,
  FOREIGN KEY (barn_id, horse_id) REFERENCES public.horses (barn_id, id) ON DELETE CASCADE,
  CHECK (kind <> 'board' OR cadence = 'monthly')
);

CREATE TRIGGER agreements_set_updated_at
  BEFORE UPDATE ON public.agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.agreement_charges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id      UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  agreement_id UUID NOT NULL,
  period       DATE NOT NULL CHECK (period = date_trunc('month', period)::date),
  fee          NUMERIC NOT NULL,
  payment_type payment_type_enum,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, id),
  UNIQUE (agreement_id, period),
  FOREIGN KEY (barn_id, agreement_id) REFERENCES public.agreements (barn_id, id) ON DELETE CASCADE
);

ALTER TABLE public.agreement_charges ENABLE ROW LEVEL SECURITY;
