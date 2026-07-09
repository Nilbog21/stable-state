CREATE TYPE payment_type_enum AS ENUM ('venmo', 'zelle', 'cash', 'check', 'freshbooks');

ALTER TABLE public.lessons ADD COLUMN payment_type payment_type_enum;
