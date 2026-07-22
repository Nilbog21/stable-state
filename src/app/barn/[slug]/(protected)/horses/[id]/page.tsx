import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getHorseById } from '@/lib/db/horses'
import { getDocumentsWithUrls } from '@/lib/db/documents'
import { getSignedUrl } from '@/lib/db/document-storage'
import { HorseManagerForm } from './HorseManagerForm'
import { HorsePhotoForm } from './HorsePhotoForm'
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
  uploadHorsePhotoAction,
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
  const boundUploadPhotoAction = uploadHorsePhotoAction.bind(null, slug, horse.id, horse.photo_path)
  const boundDeletePhotoAction = horse.photo_path
    ? deleteHorsePhotoAction.bind(null, slug, horse.id, horse.photo_path)
    : null

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {horse.name}
      </h1>

      <section className="mb-6">
        {photoUrl ? (
          <div className="flex flex-col items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not an optimizable static asset */}
            <img src={photoUrl} alt={horse.name} className="h-48 w-48 rounded-md object-cover" />
            {role === 'manager' && (
              <div className="flex items-center gap-3">
                <HorsePhotoForm action={boundUploadPhotoAction} label="Replace Photo" />
                <form action={boundDeletePhotoAction!}>
                  <Button type="submit" variant="danger" size="sm">
                    Remove
                  </Button>
                </form>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10 text-zinc-300 dark:text-zinc-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18-3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5zm10.5-11.25h.008v.008h-.008V6.75zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0z"
              />
            </svg>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No photo yet</p>
            {role === 'manager' && <HorsePhotoForm action={boundUploadPhotoAction} label="Add Photo" />}
          </div>
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
