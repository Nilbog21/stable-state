import { notFound, redirect } from 'next/navigation'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getProfileByUserId } from '@/lib/db/profiles'
import { acceptInvite, signOutAndReturnToInvite } from './actions'
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

// #1641. The claimant reached this page with the shared `/demo` account's session — the ordinary
// journey *try the demo, then accept the invite you were sent*, same browser, no sign-out in
// between. Caught here rather than left to `claim_managed_member`'s raise, because that path's
// screen says the invite is invalid or has expired: the worst possible message, since the invite
// is fine and the session is wrong.
function DemoSession({ slug, token }: { slug: string; token: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        You&rsquo;re signed in as the demo account
      </h1>
      <p className="max-w-sm text-center text-zinc-500 dark:text-zinc-400">
        Your invite is fine — but this browser is signed in to the shared demo account, and an
        invite can&rsquo;t be accepted with it. Sign out, then sign in with your own email to join.
      </p>
      <form action={signOutAndReturnToInvite.bind(null, slug, token)}>
        <Button type="submit">Sign out</Button>
      </form>
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

  const profile = await getProfileByUserId(user.id)

  if (profile?.is_demo) {
    return <DemoSession slug={slug} token={token} />
  }

  const signedInAs = profile ? `${profile.first_name} ${profile.last_name} (${user.email})` : user.email

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Join {barn.name}
      </h1>
      <p className="text-zinc-500 dark:text-zinc-400">
        Accept your invite to activate your membership.
      </p>
      {/* The token is single-use, so this is the last point at which the claimant can see which
          account is about to take the membership — the whole of what #1641 hit on prod. */}
      {/* The control sits *inside* its own form rather than being associated by `form="id"` —
          React 19's form association is unreliable with server actions (it silently drops
          `<select>` values from FormData), and nothing here needs the two to be separate. */}
      <form
        action={signOutAndReturnToInvite.bind(null, slug, token)}
        className="max-w-sm text-center text-sm text-zinc-500 dark:text-zinc-400"
      >
        Signed in as <span className="text-zinc-900 dark:text-zinc-50">{signedInAs}</span> — not you?{' '}
        <button type="submit" className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-50">
          Sign out
        </button>
      </form>
      <form action={acceptInvite.bind(null, slug, token)}>
        <Button type="submit">Accept Invite</Button>
      </form>
    </main>
  )
}
