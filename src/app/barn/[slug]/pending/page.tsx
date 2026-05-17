import { notFound, redirect } from 'next/navigation'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { createClient } from '@/lib/supabase/server'

export default async function BarnPendingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)

  if (!barn) {
    notFound()
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  if (!data.user) {
    redirect(`/barn/${slug}/login`)
  }

  const membership = await getUserMembership(data.user.id, barn.id)
  if (!membership) {
    redirect(`/barn/${slug}/register`)
  }
  // Active members need to go through login to receive their session cookie.
  if (membership.status === 'active') {
    redirect(`/barn/${slug}/login`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white dark:bg-black">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Approval pending
      </h1>
      <p className="max-w-sm text-center text-zinc-500 dark:text-zinc-400">
        Your request to join <strong className="text-zinc-900 dark:text-zinc-50">{barn.name}</strong> is
        pending approval by a manager. You will gain access once approved.
      </p>
    </main>
  )
}
