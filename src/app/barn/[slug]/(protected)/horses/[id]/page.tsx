import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseById } from '@/lib/db/horses'
import { getHorseDocuments, getDocumentSignedUrl } from '@/lib/db/horse-documents'
import { HorseAvailabilityForm } from './HorseAvailabilityForm'
import { HorseActivationSection } from './HorseActivationSection'
import { HorseDocumentUploadForm } from './HorseDocumentUploadForm'
import { updateHorseAvailabilityAction, renameHorseAction, setHorseActiveAction, uploadHorseDocumentAction, deleteHorseDocumentAction } from './actions'

const RECORD_TYPE_LABELS: Record<string, string> = {
  insurance_binder: 'Insurance Binder',
  coggins: 'Coggins',
  shot_record: 'Shot Record',
  contract: 'Contract',
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
  const boundAvailabilityAction = updateHorseAvailabilityAction.bind(null, slug, horse.id)
  const boundRenameAction = renameHorseAction.bind(null, slug, horse.id)
  const boundActivationAction = setHorseActiveAction.bind(null, slug, horse.id)

  const canSeeDocuments = role === 'manager' || role === 'trainer'

  const docsWithUrls = canSeeDocuments
    ? await (async () => {
        const docs = await getHorseDocuments(horse.id, barn.id)
        return Promise.all(docs.map(async (doc) => ({ doc, signedUrl: await getDocumentSignedUrl(doc.storage_path) })))
      })()
    : []

  const boundUploadAction = uploadHorseDocumentAction.bind(null, slug, horse.id)
  const boundDeleteAction = deleteHorseDocumentAction.bind(null, slug, horse.id)

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
        <>
          <section className="mt-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">Name</h2>
            <form action={boundRenameAction} className="flex items-center gap-3">
              <label htmlFor="horse-name" className="sr-only">Name</label>
              <input
                id="horse-name"
                name="name"
                type="text"
                defaultValue={horse.name}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Save
              </button>
            </form>
          </section>

          <section className="mt-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">Availability</h2>
            <HorseAvailabilityForm horse={horse} action={boundAvailabilityAction} />
          </section>

          <HorseActivationSection isActive={horse.is_active} action={boundActivationAction} />
        </>
      )}

      {canSeeDocuments && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Documents
          </h2>
          {docsWithUrls.length > 0 ? (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {docsWithUrls.map(({ doc, signedUrl }) => (
                <li key={doc.id} className="flex items-center justify-between py-3">
                  <div className="flex flex-col gap-0.5">
                    <a
                      href={signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-zinc-900 underline hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
                    >
                      {doc.file_name}
                    </a>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {RECORD_TYPE_LABELS[doc.record_type]}
                    </span>
                  </div>
                  {role === 'manager' && (
                    <form action={boundDeleteAction.bind(null, doc.id, doc.storage_path)}>
                      <button
                        type="submit"
                        className="text-xs text-red-600 hover:text-red-800 dark:hover:text-red-400"
                      >
                        Delete
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No documents yet.</p>
          )}

          <section className="mt-6">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Upload Document
            </h2>
            <HorseDocumentUploadForm action={boundUploadAction} />
          </section>
        </section>
      )}
    </main>
  )
}
