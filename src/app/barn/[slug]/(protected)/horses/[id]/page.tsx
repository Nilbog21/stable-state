import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getHorseById } from '@/lib/db/horses'
import { getDocumentsWithUrls } from '@/lib/db/documents'
import { HorseManagerForm } from './HorseManagerForm'
import { ReminderDateCell } from '@/components/documents/ReminderDateCell'
import { ReminderDueBadge } from '@/components/documents/ReminderDueBadge'
import { Th, Td, TableActions } from '@/components/ui/Table'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/EmptyState'
import { RECORD_TYPE_LABELS } from '@/lib/document-record-types'
import {
  updateHorseAction,
  deleteHorseDocumentAction,
  updateHorseDocumentReminderDateAction,
} from './actions'

export default async function HorseDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const { barn, membership } = await requireMembership(slug, ['manager', 'trainer', 'rider'])

  const horse = await getHorseById(id, barn.id)
  if (!horse) notFound()

  const role = membership.role

  const canSeeDocuments = role === 'manager' || role === 'trainer'

  const docsWithUrls = canSeeDocuments ? await getDocumentsWithUrls('horse', horse.id, barn.id) : []

  const boundUpdateAction = updateHorseAction.bind(null, slug, horse.id)
  const boundDeleteAction = deleteHorseDocumentAction.bind(null, slug, horse.id)
  const boundReminderDateAction = updateHorseDocumentReminderDateAction.bind(null, slug, horse.id)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {horse.name}
      </h1>

      {role !== 'manager' && (
        <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Status</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">
              {horse.is_available ? 'Available' : 'Unavailable'}
            </dd>
          </div>

          {!horse.is_available && horse.unavailability_reason && (
            <div className="flex flex-col gap-1 py-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Reason</dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-50">{horse.unavailability_reason}</dd>
            </div>
          )}

          {horse.feed_notes && (
            <div className="flex flex-col gap-1 py-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Feed Notes</dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-50">{horse.feed_notes}</dd>
            </div>
          )}

          {horse.medication_notes && (
            <div className="flex flex-col gap-1 py-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Medication Notes</dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-50">{horse.medication_notes}</dd>
            </div>
          )}
        </dl>
      )}

      {role === 'manager' && (
        <section className="mt-6">
          <HorseManagerForm horse={horse} barn={barn} action={boundUpdateAction} />
        </section>
      )}

      {canSeeDocuments && (
        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Documents
            </h2>
            <Button href={`/barn/${slug}/documents/new?entity=horse&id=${horse.id}`}>Add Document</Button>
          </div>
          {docsWithUrls.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Type</Th>
                    <Th>Notes</Th>
                    <Th>Link</Th>
                    <Th>Reminder Date</Th>
                    {role === 'manager' && <Th align="right">Actions</Th>}
                  </tr>
                </thead>
                <tbody>
                  {docsWithUrls.map(({ doc, signedUrl }) => (
                    <tr key={doc.id}>
                      <Td>{RECORD_TYPE_LABELS[doc.record_type]}</Td>
                      <Td tone="secondary">{doc.notes ?? '—'}</Td>
                      <Td>
                        <a
                          href={signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-zinc-900 hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
                        >
                          {doc.file_name}
                        </a>
                      </Td>
                      <Td tone="secondary">
                        <div className="flex items-center gap-2">
                          {role === 'manager' ? (
                            <ReminderDateCell docId={doc.id} initialValue={doc.reminder_date} action={boundReminderDateAction} />
                          ) : (
                            doc.reminder_date ?? '—'
                          )}
                          <ReminderDueBadge reminderDate={doc.reminder_date} />
                        </div>
                      </Td>
                      {role === 'manager' && (
                        <TableActions>
                          <form action={boundDeleteAction.bind(null, doc.id, doc.storage_path)}>
                            <Button type="submit" variant="danger" size="sm">
                              Delete
                            </Button>
                          </form>
                        </TableActions>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState heading="No documents yet" subtext="Documents you upload will appear here." />
          )}
        </section>
      )}
    </main>
  )
}
