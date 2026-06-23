CREATE TYPE horse_document_type AS ENUM (
  'insurance_binder',
  'coggins',
  'shot_record',
  'contract'
);

CREATE TYPE trainer_document_type AS ENUM ('instructor_contract');

CREATE TABLE public.horse_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id      UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  horse_id     UUID NOT NULL,
  record_type  horse_document_type NOT NULL,
  storage_path TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  file_size    INTEGER NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, id),
  FOREIGN KEY (barn_id, horse_id) REFERENCES public.horses(barn_id, id) ON DELETE CASCADE
);

CREATE TRIGGER horse_documents_set_updated_at
  BEFORE UPDATE ON public.horse_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.horse_documents ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.trainer_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id      UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  trainer_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_type  trainer_document_type NOT NULL,
  storage_path TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  file_size    INTEGER NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barn_id, id)
);

CREATE TRIGGER trainer_documents_set_updated_at
  BEFORE UPDATE ON public.trainer_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.trainer_documents ENABLE ROW LEVEL SECURITY;
