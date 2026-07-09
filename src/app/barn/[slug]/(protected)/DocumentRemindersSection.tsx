'use client'
import Link from 'next/link'
import type { DueDocument } from '@/lib/db/types'
import { localToday } from '@/lib/local-day'

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
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Document Reminders
      </h2>
      <ul className="space-y-2">
        {due.map((doc) => (
          <li key={doc.id}>
            <Link
              href={dueDocumentHref(slug, doc)}
              className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
            >
              <span className="font-medium">
                {doc.ownerName} — {RECORD_TYPE_LABELS[doc.recordType] ?? doc.recordType}
              </span>
              <span>{formatDate(doc.reminderDate)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
