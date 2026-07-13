import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getHorseById } from '@/lib/db/horses'
import { getMembershipById } from '@/lib/db/barn-memberships'
import { getProfileById } from '@/lib/db/profiles'
import { DocumentUploadForm } from './DocumentUploadForm'
import { uploadDocumentAction, type DocumentEntity } from './actions'

export default async function NewDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ entity?: string; id?: string }>
}) {
  const { slug } = await params
  const { entity, id } = await searchParams

  if (!id || (entity !== 'horse' && entity !== 'trainer' && entity !== 'rider')) notFound()

  if (entity === 'horse') {
    const { barn } = await requireMembership(slug, ['manager', 'trainer'])
    const horse = await getHorseById(id, barn.id)
    if (!horse) notFound()

    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Add Document — {horse.name}
        </h1>
        <DocumentUploadForm entity="horse" action={uploadDocumentAction.bind(null, slug, 'horse' as DocumentEntity, horse.id)} />
        <Link
          href={`/barn/${slug}/horses/${horse.id}`}
          className="mt-4 inline-block text-sm text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Cancel
        </Link>
      </main>
    )
  }

  const { user, barn, membership: callerMembership } = await requireMembership(slug, ['manager', 'trainer', 'rider'])

  const targetMembership = await getMembershipById(id)
  if (!targetMembership || targetMembership.barn_id !== barn.id) notFound()
  if (targetMembership.role !== 'trainer' && targetMembership.role !== 'rider' && targetMembership.role !== 'manager') notFound()
  if (!targetMembership.user_id) notFound()

  const isOwnPage = targetMembership.user_id === user.id
  const canUpload =
    callerMembership.role === 'manager' ||
    (callerMembership.role === 'trainer' && isOwnPage) ||
    (callerMembership.role === 'rider' && isOwnPage)
  if (!canUpload) notFound()

  const targetProfile = await getProfileById(targetMembership.profile_id)
  const displayName = targetProfile ? `${targetProfile.first_name} ${targetProfile.last_name}` : targetMembership.id

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Add Document — {displayName}
      </h1>
      <DocumentUploadForm entity={entity} action={uploadDocumentAction.bind(null, slug, entity, targetMembership.id)} />
      <Link
        href={`/barn/${slug}/members/${targetMembership.id}`}
        className="mt-4 inline-block text-sm text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        Cancel
      </Link>
    </main>
  )
}
