/**
 * Document record-type vocabulary — which record types each document entity
 * (horse/trainer/rider) supports and their display labels. Shared by the
 * upload form's `<select>`, the upload action's validation, the horse/member
 * detail pages' Documents tables, and the dashboard's
 * `DocumentRemindersSection`. The per-entity options list is the single
 * source of truth, with the flat label map and valid-value sets derived from
 * it, so adding a record type means editing the DB enum plus this one module.
 */

export type DocumentEntity = 'horse' | 'trainer' | 'rider'

export const RECORD_TYPE_OPTIONS: Record<DocumentEntity, { value: string; label: string }[]> = {
  horse: [
    { value: 'insurance_binder', label: 'Insurance Binder' },
    { value: 'coggins', label: 'Coggins' },
    { value: 'shot_record', label: 'Shot Record' },
    { value: 'contract', label: 'Contract' },
    { value: 'other', label: 'Other' },
  ],
  trainer: [
    { value: 'instructor_contract', label: 'Instructor Contract' },
    { value: 'other', label: 'Other' },
  ],
  rider: [
    { value: 'liability_waiver', label: 'Liability Waiver' },
    { value: 'lease_agreement', label: 'Lease Agreement' },
    { value: 'boarding_contract', label: 'Boarding Contract' },
    { value: 'other', label: 'Other' },
  ],
}

// Derived from RECORD_TYPE_OPTIONS rather than restated, so this map and the
// options list above cannot drift out of sync.
export const RECORD_TYPE_LABELS: Record<string, string> = Object.fromEntries(Object.values(RECORD_TYPE_OPTIONS).flat().map((o) => [o.value, o.label]))

// Derived from RECORD_TYPE_OPTIONS rather than restated, so this and the
// options list above cannot drift out of sync.
export const RECORD_TYPE_VALUES: Record<DocumentEntity, Set<string>> = {
  horse: new Set(RECORD_TYPE_OPTIONS.horse.map((o) => o.value)),
  trainer: new Set(RECORD_TYPE_OPTIONS.trainer.map((o) => o.value)),
  rider: new Set(RECORD_TYPE_OPTIONS.rider.map((o) => o.value)),
}
