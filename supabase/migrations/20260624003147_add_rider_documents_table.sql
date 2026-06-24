CREATE TYPE rider_document_type AS ENUM ('liability_waiver', 'lease_agreement', 'boarding_contract');

CREATE TABLE public.rider_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id      UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  rider_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_type  rider_document_type NOT NULL,
  storage_path TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  file_size    INTEGER NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, id)
);

CREATE TRIGGER rider_documents_set_updated_at
  BEFORE UPDATE ON public.rider_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.rider_documents ENABLE ROW LEVEL SECURITY;
