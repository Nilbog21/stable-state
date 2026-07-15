'use client'
import type { DueDocument } from '@/lib/db/types'
import { localToday } from '@/lib/local-day'
import { formatShortDate } from '@/lib/format-date'
import { RECORD_TYPE_LABELS } from '@/lib/document-record-types'
import { Button } from '@/components/ui/Button'

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
            {doc.ownerName} — {RECORD_TYPE_LABELS[doc.recordType] ?? doc.recordType} — {formatShortDate(doc.reminderDate)}
          </Button>
        </div>
      ))}
    </>
  )
}
