import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getHorseExertionSummary } from '@/lib/db/horses'
import { HorseOverviewTable } from './HorseOverviewTable'

export default async function HorseOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) notFound()

  const membership = await getEffectiveMembership(data.user.id, barn.id)
  if (!membership || membership.status !== 'active') notFound()

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const horses = await getHorseExertionSummary(barn.id, sevenDaysAgo)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {barn.name} — Horses
      </h1>
      <HorseOverviewTable horses={horses} />
    </main>
  )
}
