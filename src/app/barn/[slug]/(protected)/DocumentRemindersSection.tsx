'use client'
import type { DueDocument } from '@/lib/db/types'
import { localToday } from '@/lib/local-day'
import { Button } from '@/components/ui/Button'

const RECORD_TYPE_LABELS: Record<string, string> = {
  insurance_binder: 'Insurance Binder',
  coggins: 'Coggins',
  shot_record: 'Shot Record',
  contract: 'Contract',
  instructor_contract: 'Instructor Contract',
  liability_waiver: 'Liability Waiver',
  lease_agreement: 'Lease Agreement',
  boarding_contract: 'Boarding Contract',
  other: 'Other',
}

function formatDate(dateOnly: string): string {
  return new Date(dateOnly).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function dueDocumentHref(slug: string, doc: DueDocument): string {
  return doc.entity === 'horse' ? `/barn/${slug}/horses/${doc.ownerId}` : `/barn/${slug}/members/${doc.ownerId}`
}

export function DocumentRemindersSection({ slug, dueDocuments }: { slug: string; dueDocuments: DueDocument[] }) {
  // See the tradeoff comment on localToday in @/lib/local-day.
  const today = localToday()
  const due = dueDocuments.filter((doc) => doc.reminderDate <= today)

  if (due.length === 0) return null

  return (
    <>
      {due.map((doc) => (
        <div key={doc.id}>
          <Button href={dueDocumentHref(slug, doc)} variant="warning">
            {doc.ownerName} — {RECORD_TYPE_LABELS[doc.recordType] ?? doc.recordType} — {formatDate(doc.reminderDate)}
          </Button>
        </div>
      ))}
    </>
  )
}
