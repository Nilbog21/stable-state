import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { createTierAction } from '../../actions'
import { TierForm } from '../TierForm'

export default async function TierNewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()
  if (!user) redirect(`/barn/${slug}/login`)

  const membership = await getUserMembership(user.id, barn.id)
  if (!membership || membership.status !== 'active' || membership.role !== 'manager') {
    redirect(`/barn/${slug}/login`)
  }

  const save = createTierAction.bind(null, slug)

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        New Tier
      </h1>
      <TierForm mode="new" slug={slug} onSave={save} />
    </main>
  )
}
