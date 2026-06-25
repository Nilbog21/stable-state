import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getTierById } from '@/lib/db/lesson-tiers'
import {
  updateTierAction,
  deactivateTierAction,
  reactivateTierAction,
  setDefaultTierAction,
} from '../../actions'
import { TierForm } from '../TierForm'

export default async function TierEditPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()
  if (!user) redirect(`/barn/${slug}/login`)

  const membership = await getUserMembership(user.id, barn.id)
  if (!membership || membership.status !== 'active' || membership.role !== 'manager') {
    redirect(`/barn/${slug}/login`)
  }

  const tier = await getTierById(id, barn.id)
  if (!tier) notFound()

  const save = updateTierAction.bind(null, slug, id)
  const deactivate = deactivateTierAction.bind(null, slug, id)
  const activate = reactivateTierAction.bind(null, slug, id)
  const setDefault = setDefaultTierAction.bind(null, slug, id)

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Edit Tier
      </h1>
      <TierForm
        mode="edit"
        slug={slug}
        initialTier={tier}
        onSave={save}
        onDeactivate={deactivate}
        onActivate={activate}
        onSetDefault={setDefault}
      />
    </main>
  )
}
