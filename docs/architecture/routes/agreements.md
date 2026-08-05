# Agreements routes

## `/barn/[slug]/agreements`

**Roles:** manager

Kind-scoped list (`?kind=lease|board`, defaults to `lease` when missing/invalid) of agreements of that kind, rendered as full-card links (`Card`, matching the Horses page pattern) to `/barn/[slug]/agreements/[id]` — each card shows rider, horse, fee, and status via the shared `getAgreementStatusLabel` helper (`src/lib/db/agreements.ts`: `is_active=false` → "Ended"; `is_active=true` + `cadence='one_time'` → "Complete", since a one-time agreement's single charge is created at creation and never bills again; `is_active=true` + `cadence='monthly'` → "Active"); no separate row-level Edit link — Edit remains reachable from the detail page; **Add Lease**/**Add Boarding** button top-right; `EmptyState` when the list is empty

## `/barn/[slug]/agreements/new`

**Roles:** manager

Add form (`?kind=` from the list's Add button): rider select, horse select, fee, start date (default today); lease shows a cadence select (`one_time`|`monthly`); board hides cadence (forced `monthly`) and pre-fills fee from `getBarnDefaultBoardFee`

## `/barn/[slug]/agreements/[id]`

**Roles:** manager

Agreement detail page: rider and horse (resolved via `resolveMemberNames`/`resolveHorseNames`), fee, cadence, and status via the shared `getAgreementStatusLabel` helper (see the list route above), plus every charge from `getChargesForAgreement`; each charge row has an inline **Payment Type** dropdown (`ChargesTable` client component, mirrors `OutstandingTable`'s mark-paid pattern — calls `updateChargePaymentTypeAction`, then `router.refresh()`) and an editable **Fee** input (calls `updateChargeFeeAction` on blur, only when changed) for pro-rating a single occurrence; **Edit** button top-right links to `[id]/edit`

## `/barn/[slug]/agreements/[id]/edit`

**Roles:** manager

Edit form: only fee is editable; rider, horse, start date, and cadence are shown read-only (resolved via `resolveMemberNames`/`resolveHorseNames`) — to change any of those, end the agreement and create a new one; **End Agreement** button (confirm dialog) sets `is_active=false`, hidden once already ended
