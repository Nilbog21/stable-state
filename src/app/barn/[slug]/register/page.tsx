import { notFound, redirect } from 'next/navigation'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { acceptInvite } from './actions'
import { Button } from '@/components/ui/Button'

function InvalidInvite({ barnName }: { barnName: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white dark:bg-black">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Invite invalid
      </h1>
      <p className="max-w-sm text-center text-zinc-500 dark:text-zinc-400">
        This invite link to <strong className="text-zinc-900 dark:text-zinc-50">{barnName}</strong> is
        invalid or has expired. Contact your barn manager for a new invite.
      </p>
    </main>
  )
}

export default async function BarnRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const { slug } = await params
  const { token, error } = await searchParams
  const barn = await getBarnBySlug(slug)

  if (!barn) {
    notFound()
  }

  if (!token || error) {
    return <InvalidInvite barnName={barn.name} />
  }

  const user = await getAuthenticatedUser()

  if (!user) {
    redirect(`/barn/${slug}/login?token=${encodeURIComponent(token)}`)
  }

  const existing = await getUserMembership(user.id, barn.id)
  if (existing?.status === 'active') {
    redirect(`/barn/${slug}/`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Join {barn.name}
      </h1>
      <p className="text-zinc-500 dark:text-zinc-400">
        Accept your invite to activate your membership.
      </p>
      <form action={acceptInvite.bind(null, slug, token)}>
        <Button type="submit">Accept Invite</Button>
      </form>
    </main>
  )
}
