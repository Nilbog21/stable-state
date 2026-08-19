# `types.ts`

Shared TypeScript types

`AgreementChargeRow = Omit<AgreementCharge, 'payment_type'>` (#1441) — an `agreement_charges` row as the DB actually holds it, which is what the three charge-writing RPCs (`update_agreement_charge_fee`, `mark_agreement_charge_paid`, `generate_agreement_charge`, all `RETURNS agreement_charges`) return. The column has been gone since #831; payment type lives on the paired `transactions` row and is joined back on by `getChargesForAgreement`, which is the only reader that produces a full `AgreementCharge`.
