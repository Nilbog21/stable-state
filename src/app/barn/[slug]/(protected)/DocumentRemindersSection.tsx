'use client'
import type { DueDocument } from '@/lib/db/types'
import { formatShortDate } from '@/lib/format-date'
import { RECORD_TYPE_LABELS } from '@/lib/document-record-types'
import { Button } from '@/components/ui/Button'

function dueDocumentHref(slug: string, doc: DueDocument): string {
  return doc.entity === 'horse' ? `/barn/${slug}/horses/${doc.ownerId}` : `/barn/${slug}/members/${doc.ownerId}`
}

// #1224 — `getDueDocuments` now applies the barn's own day as its cutoff, so there is nothing left
// to narrow here. The #1149-era `today` prop and its re-filter are gone; the dashboard's Reminders
// header is computed from this same already-filtered list, so it can no longer render empty.
export function DocumentRemindersSection({ slug, dueDocuments }: { slug: string; dueDocuments: DueDocument[] }) {
  if (dueDocuments.length === 0) return null

  return (
    <>
      {dueDocuments.map((doc) => (
        <div key={doc.id}>
          <Button href={dueDocumentHref(slug, doc)} variant="warning">
            {doc.ownerName} — {RECORD_TYPE_LABELS[doc.recordType] ?? doc.recordType} — {formatShortDate(doc.reminderDate)}
          </Button>
        </div>
      ))}
    </>
  )
}
