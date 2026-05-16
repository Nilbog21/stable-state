import { notFound, redirect } from 'next/navigation'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { createClient } from '@/lib/supabase/server'
import { registerForBarn } from './actions'

export default async function BarnRegisterPage({
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

  const existing = await getUserMembership(data.user.id, barn.id)
  if (existing?.status === 'active') {
    redirect(`/barn/${slug}/`)
  }
  if (existing?.status === 'pending') {
    redirect(`/barn/${slug}/pending`)
  }

  const meta = data.user.user_metadata ?? {}
  const fullName: string = meta.full_name ?? ''
  const [defaultFirst = '', ...rest] = fullName.split(' ')
  const defaultLast = rest.join(' ') || (meta.family_name ?? '')
  const defaultFirstName: string = meta.given_name ?? defaultFirst

  const action = registerForBarn.bind(null, slug)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Join {barn.name}
      </h1>
      <p className="text-zinc-500 dark:text-zinc-400">
        Request access to this barn.
      </p>
      <form action={action} className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="firstName" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            First name
          </label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            required
            defaultValue={defaultFirstName}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="lastName" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Last name
          </label>
          <input
            id="lastName"
            name="lastName"
            type="text"
            required
            defaultValue={defaultLast}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Role</legend>
          <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
            <input type="radio" name="role" value="trainer" required />
            Trainer
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
            <input type="radio" name="role" value="rider" required />
            Rider
          </label>
        </fieldset>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Request access
        </button>
      </form>
    </main>
  )
}
