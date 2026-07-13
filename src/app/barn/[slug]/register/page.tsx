import { notFound, redirect } from 'next/navigation'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, claimManagedMember } from '@/lib/db/barn-memberships'
import { getAuthenticatedUser } from '@/lib/db/auth'

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
  searchParams: Promise<{ token?: string }>
}) {
  const { slug } = await params
  const { token } = await searchParams
  const barn = await getBarnBySlug(slug)

  if (!barn) {
    notFound()
  }

  if (!token) {
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
  if (existing?.status === 'pending') {
    redirect(`/barn/${slug}/pending`)
  }

  if (!user.email) {
    return <InvalidInvite barnName={barn.name} />
  }

  try {
    await claimManagedMember(token, user.id, user.email)
  } catch {
    return <InvalidInvite barnName={barn.name} />
  }

  redirect(`/barn/${slug}/`)
}
