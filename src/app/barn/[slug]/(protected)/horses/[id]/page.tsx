import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseById } from '@/lib/db/horses'
import { getDocuments } from '@/lib/db/documents'
import { getSignedUrl } from '@/lib/db/document-storage'
import { HorseManagerForm } from './HorseManagerForm'
import { HorseDocumentUploadForm } from './HorseDocumentUploadForm'
import { HorseExhaustionThresholdsForm } from './HorseExhaustionThresholdsForm'
import { ReminderDateCell } from '@/components/documents/ReminderDateCell'
import {
  updateHorseDetailsAction,
  uploadHorseDocumentAction,
  deleteHorseDocumentAction,
  updateHorseExhaustionThresholdsAction,
  updateHorseDocumentReminderDateAction,
} from './actions'

const RECORD_TYPE_LABELS: Record<string, string> = {
  insurance_binder: 'Insurance Binder',
  coggins: 'Coggins',
  shot_record: 'Shot Record',
  contract: 'Contract',
  other: 'Other',
}

export default async function HorseDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()
  if (!user) notFound()

  const membership = await getUserMembership(user.id, barn.id)
  if (!membership || membership.status !== 'active') notFound()

  const horse = await getHorseById(id, barn.id)
  if (!horse) notFound()

  const role = membership.role

  const canSeeDocuments = role === 'manager' || role === 'trainer'

  const docsWithUrls = canSeeDocuments
    ? await (async () => {
        const docs = await getDocuments('horse', horse.id, barn.id)
        return Promise.all(docs.map(async (doc) => ({ doc, signedUrl: await getSignedUrl(doc.storage_path) })))
      })()
    : []

  const boundUpdateAction = updateHorseDetailsAction.bind(null, slug, horse.id)
  const boundUploadAction = uploadHorseDocumentAction.bind(null, slug, horse.id)
  const boundDeleteAction = deleteHorseDocumentAction.bind(null, slug, horse.id)
  const boundUpdateThresholdsAction = updateHorseExhaustionThresholdsAction.bind(null, slug, horse.id)
  const boundReminderDateAction = updateHorseDocumentReminderDateAction.bind(null, slug, horse.id)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {horse.name}
      </h1>

      {role !== 'manager' && (
        <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Status</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">
              {horse.is_available ? 'Available' : 'Unavailable'}
            </dd>
          </div>

          {!horse.is_available && horse.unavailability_reason && (
            <div className="flex flex-col gap-1 py-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Reason</dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-50">{horse.unavailability_reason}</dd>
            </div>
          )}
        </dl>
      )}

      {role === 'manager' && (
        <section className="mt-6">
          <HorseManagerForm horse={horse} action={boundUpdateAction} />
        </section>
      )}

      {role === 'manager' && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Exhaustion Thresholds
          </h2>
          <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
            Override this horse&apos;s exhaustion thresholds — useful for horses on light duty. Leave on barn defaults otherwise.
          </p>
          <HorseExhaustionThresholdsForm horse={horse} barn={barn} action={boundUpdateThresholdsAction} />
        </section>
      )}

      {canSeeDocuments && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Documents
          </h2>
          {docsWithUrls.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th className="pb-2 pr-6">Type</th>
                  <th className="pb-2 pr-6">Notes</th>
                  <th className="pb-2 pr-6">Link</th>
                  <th className="pb-2 pr-6">Reminder Date</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {docsWithUrls.map(({ doc, signedUrl }) => (
                  <tr key={doc.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">{RECORD_TYPE_LABELS[doc.record_type]}</td>
                    <td className="py-3 pr-6 text-sm text-zinc-500 dark:text-zinc-400">{doc.notes ?? '—'}</td>
                    <td className="py-3 pr-6 text-sm">
                      <a
                        href={signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-zinc-900 hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
                      >
                        {doc.file_name}
                      </a>
                    </td>
                    <td className="py-3 pr-6 text-sm text-zinc-500 dark:text-zinc-400">
                      {role === 'manager' ? (
                        <ReminderDateCell docId={doc.id} initialValue={doc.reminder_date} action={boundReminderDateAction} />
                      ) : (
                        doc.reminder_date ?? '—'
                      )}
                    </td>
                    <td className="py-3 text-sm">
                      {role === 'manager' && (
                        <form action={boundDeleteAction.bind(null, doc.id, doc.storage_path)}>
                          <button
                            type="submit"
                            className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
                          >
                            Delete
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No documents yet.</p>
          )}

          <section className="mt-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Upload Document
            </h2>
            <HorseDocumentUploadForm action={boundUploadAction} />
          </section>
        </section>
      )}
    </main>
  )
}
