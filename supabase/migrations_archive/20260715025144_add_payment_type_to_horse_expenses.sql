-- #872: add payment_type to horse_expenses, mirroring lessons/agreement_charges
ALTER TABLE public.horse_expenses
  ADD COLUMN payment_type payment_type_enum;
