import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getHorseById } from '@/lib/db/horses'
import { getDocumentsWithUrls } from '@/lib/db/documents'
import { getSignedUrl } from '@/lib/db/document-storage'
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
  deleteHorsePhotoAction,
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
  const photoUrl = horse.photo_path ? await getSignedUrl(horse.photo_path) : null

  const boundUpdateAction = updateHorseAction.bind(null, slug, horse.id)
  const boundDeleteAction = deleteHorseDocumentAction.bind(null, slug, horse.id)
  const boundReminderDateAction = updateHorseDocumentReminderDateAction.bind(null, slug, horse.id)
  const boundDeletePhotoAction = horse.photo_path
    ? deleteHorsePhotoAction.bind(null, slug, horse.id)
    : null
  const photoHref = `/barn/${slug}/documents/new?entity=horse&id=${horse.id}&type=photo`

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {horse.name}
      </h1>

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Photo
          </h2>
          {role === 'manager' && (
            photoUrl ? (
              <div className="flex items-center gap-3">
                <Button href={photoHref} variant="ghost" size="sm">Replace Photo</Button>
                <form action={boundDeletePhotoAction!}>
                  <Button type="submit" variant="danger" size="sm">
                    Remove
                  </Button>
                </form>
              </div>
            ) : (
              <Button href={photoHref} size="sm">Set Photo</Button>
            )
          )}
        </div>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL, not an optimizable static asset
          <img src={photoUrl} alt={horse.name} className="h-48 w-auto rounded-md" />
        ) : (
          <EmptyState heading="No photo yet" subtext="A photo helps riders identify this horse at a glance." />
        )}
      </section>

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
