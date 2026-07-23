import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getHorseById } from '@/lib/db/horses'
import { getMembershipById } from '@/lib/db/barn-memberships'
import { getProfileById } from '@/lib/db/profiles'
import { canManage } from '@/lib/document-target'
import { DocumentUploadForm } from './DocumentUploadForm'
import { uploadDocumentAction } from './actions'
import { uploadHorsePhotoAction } from '../../horses/[id]/actions'
import { uploadProfilePhotoAction } from '../../members/[membership_id]/actions'
import type { DocumentEntity } from '@/lib/document-record-types'

export default async function NewDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ entity?: string; id?: string; type?: string }>
}) {
  const { slug } = await params
  const { entity, id, type } = await searchParams

  if (!id || (entity !== 'horse' && entity !== 'trainer' && entity !== 'rider' && entity !== 'profile')) notFound()

  if (entity === 'profile' && type === 'photo') {
    const { user, barn, membership: callerMembership } = await requireMembership(slug, ['manager', 'trainer', 'rider'])

    const targetMembership = await getMembershipById(id)
    if (!targetMembership || targetMembership.barn_id !== barn.id) notFound()

    const targetProfile = await getProfileById(targetMembership.profile_id)
    if (!targetProfile) notFound()

    const isOwnPage = targetMembership.user_id === user.id
    if (!isOwnPage && !(callerMembership.role === 'manager' && targetProfile.is_managed)) notFound()

    const displayName = `${targetProfile.first_name} ${targetProfile.last_name}`

    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {targetProfile.photo_path ? 'Replace' : 'Set'} Photo — {displayName}
        </h1>
        <DocumentUploadForm
          entity="rider"
          photoMode
          action={uploadProfilePhotoAction.bind(null, slug, targetMembership.id)}
          cancelHref={`/barn/${slug}/members/${targetMembership.id}`}
        />
      </main>
    )
  }

  if (entity === 'horse' && type === 'photo') {
    const { barn } = await requireMembership(slug, ['manager'])
    const horse = await getHorseById(id, barn.id)
    if (!horse) notFound()

    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {horse.photo_path ? 'Replace' : 'Set'} Photo — {horse.name}
        </h1>
        <DocumentUploadForm
          entity="horse"
          photoMode
          action={uploadHorsePhotoAction.bind(null, slug, horse.id)}
          cancelHref={`/barn/${slug}/horses/${horse.id}`}
        />
      </main>
    )
  }

  if (entity === 'horse') {
    const { barn } = await requireMembership(slug, ['manager', 'trainer'])
    const horse = await getHorseById(id, barn.id)
    if (!horse) notFound()

    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Add Document — {horse.name}
        </h1>
        <DocumentUploadForm
          entity="horse"
          action={uploadDocumentAction.bind(null, slug, 'horse' as DocumentEntity, horse.id)}
          cancelHref={`/barn/${slug}/horses/${horse.id}`}
        />
      </main>
    )
  }

  const { user, barn, membership: callerMembership } = await requireMembership(slug, ['manager', 'trainer', 'rider'])

  const targetMembership = await getMembershipById(id)
  if (!targetMembership || targetMembership.barn_id !== barn.id) notFound()

  const isOwnPage = targetMembership.user_id === user.id
  if (!canManage(callerMembership.role, isOwnPage)) notFound()

  // Rendered form options must match the target's real role, not the caller-suppliable
  // `entity` query param (mirrors the server-side derivation in uploadDocumentAction).
  const resolvedEntity: DocumentEntity = targetMembership.role === 'rider' ? 'rider' : 'trainer'

  const targetProfile = await getProfileById(targetMembership.profile_id)
  const displayName = targetProfile ? `${targetProfile.first_name} ${targetProfile.last_name}` : targetMembership.id

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Add Document — {displayName}
      </h1>
      <DocumentUploadForm
        entity={resolvedEntity}
        action={uploadDocumentAction.bind(null, slug, resolvedEntity, targetMembership.id)}
        cancelHref={`/barn/${slug}/members/${targetMembership.id}`}
      />
    </main>
  )
}
