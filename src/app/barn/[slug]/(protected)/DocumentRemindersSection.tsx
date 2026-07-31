'use client'
import type { DueDocument } from '@/lib/db/types'
import { formatShortDate } from '@/lib/format-date'
import { RECORD_TYPE_LABELS } from '@/lib/document-record-types'
import { Button } from '@/components/ui/Button'

function dueDocumentHref(slug: string, doc: DueDocument): string {
  return doc.entity === 'horse' ? `/barn/${slug}/horses/${doc.ownerId}` : `/barn/${slug}/members/${doc.ownerId}`
}

// `today` is the barn's own day, computed server-side by the dashboard page (#1149) — the same
// value its Day view heading uses. `getDueDocuments` fetches on a coarser UTC-day cutoff, so this
// narrows the result to what the barn itself would call due, rather than re-deriving "today" from
// the viewer's clock (which lands a day off whenever their device zone differs from the barn's).
export function DocumentRemindersSection({ slug, today, dueDocuments }: { slug: string; today: string; dueDocuments: DueDocument[] }) {
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
