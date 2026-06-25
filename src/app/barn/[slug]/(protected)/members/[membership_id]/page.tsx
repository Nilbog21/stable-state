import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getMembershipById } from '@/lib/db/barn-memberships'
import { getProfileByUserId } from '@/lib/db/profiles'
import { getTrainerDocuments } from '@/lib/db/trainer-documents'
import { getRiderDocuments } from '@/lib/db/rider-documents'
import { getSignedUrl } from '@/lib/db/document-storage'
import { UploadForm } from './UploadForm'
import { uploadDocumentAction, deleteDocumentAction } from './actions'
import type { TrainerDocument, RiderDocument } from '@/lib/db/types'

const RECORD_TYPE_LABELS: Record<string, string> = {
  instructor_contract: 'Instructor Contract',
  liability_waiver: 'Liability Waiver',
  lease_agreement: 'Lease Agreement',
  boarding_contract: 'Boarding Contract',
  other: 'Other',
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ slug: string; membership_id: string }>
}) {
  const { slug, membership_id } = await params

  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()
  if (!user) redirect(`/barn/${slug}/login`)

  const callerMembership = await getUserMembership(user.id, barn.id)
  if (!callerMembership || callerMembership.status !== 'active') redirect(`/barn/${slug}/login`)

  const targetMembership = await getMembershipById(membership_id)
  if (!targetMembership || targetMembership.barn_id !== barn.id) notFound()

  const isOwnPage = targetMembership.user_id === user.id
  const callerRole = callerMembership.role
  const targetRole = targetMembership.role

  const canAccess =
    callerRole === 'manager' ||
    (callerRole === 'trainer' && (isOwnPage || targetRole === 'rider')) ||
    (callerRole === 'rider' && isOwnPage)

  if (!canAccess) notFound()

  if (targetRole !== 'trainer' && targetRole !== 'rider') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No documents available.</p>
      </main>
    )
  }

  const canUpload =
    callerRole === 'manager' ||
    (callerRole === 'trainer' && isOwnPage) ||
    (callerRole === 'rider' && isOwnPage)

  if (!targetMembership.user_id) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No account linked — documents unavailable.</p>
      </main>
    )
  }

  const targetProfile = await getProfileByUserId(targetMembership.user_id)
  const displayName = targetProfile
    ? `${targetProfile.first_name} ${targetProfile.last_name}`
    : targetMembership.user_id

  type DocWithUrl = { doc: TrainerDocument | RiderDocument; signedUrl: string }
  let docsWithUrls: DocWithUrl[] = []

  if (targetRole === 'trainer') {
    const docs = await getTrainerDocuments(targetMembership.user_id, barn.id)
    docsWithUrls = await Promise.all(
      docs.map(async (doc) => ({ doc, signedUrl: await getSignedUrl(doc.storage_path) }))
    )
  } else {
    const docs = await getRiderDocuments(targetMembership.user_id, barn.id)
    docsWithUrls = await Promise.all(
      docs.map(async (doc) => ({ doc, signedUrl: await getSignedUrl(doc.storage_path) }))
    )
  }

  const boundUpload = uploadDocumentAction.bind(null, slug, membership_id)
  const boundDelete = deleteDocumentAction.bind(null, slug, membership_id)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {displayName}
      </h1>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Documents
        </h2>
        {docsWithUrls.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-2 pr-6">Type</th>
                <th className="pb-2 pr-6">Notes</th>
                <th className="pb-2 pr-6">Link</th>
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
                  <td className="py-3 text-sm">
                    {canUpload && (
                      <form action={boundDelete.bind(null, doc.id, targetRole, doc.storage_path)}>
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
      </section>

      {canUpload && (
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Upload Document
          </h2>
          <UploadForm memberRole={targetRole as 'trainer' | 'rider'} action={boundUpload} />
        </section>
      )}
    </main>
  )
}
