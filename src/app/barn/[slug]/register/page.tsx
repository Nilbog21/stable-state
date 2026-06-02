import { notFound, redirect } from 'next/navigation'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { createClient } from '@/lib/supabase/server'
import { registerForBarn } from './actions'
import { RegisterForm } from './RegisterForm'

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
  const defaultLastName = rest.join(' ') || (meta.family_name ?? '')
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
      <RegisterForm
        defaultFirstName={defaultFirstName}
        defaultLastName={defaultLastName}
        action={action}
      />
    </main>
  )
}
