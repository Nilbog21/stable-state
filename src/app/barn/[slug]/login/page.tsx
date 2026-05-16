import { notFound } from 'next/navigation'
import { getBarnBySlug } from '@/lib/db/barns'
import { signInWithGoogleForBarn } from '@/app/actions/auth'

export default async function BarnLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)

  if (!barn) {
    notFound()
  }

  const signIn = signInWithGoogleForBarn.bind(null, slug)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {barn.name}
      </h1>
      <p className="text-lg text-zinc-500 dark:text-zinc-400">
        Stable State
      </p>
      <form action={signIn}>
        <button
          type="submit"
          className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-6 py-3 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          Sign in with Google
        </button>
      </form>
    </main>
  )
}
