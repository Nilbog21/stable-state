import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { getBarnBySlug } from '@/lib/db/barns'
import { signInWithGoogleForBarn } from '@/app/actions/auth'

export default async function BarnLoginPage({
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

  const signIn = signInWithGoogleForBarn.bind(null, slug, token)
  const rememberPref = (await cookies()).get('remember_me_pref')?.value
  const rememberChecked = rememberPref !== '0'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {barn.name}
      </h1>
      <p className="text-lg text-zinc-500 dark:text-zinc-400">
        Stable State
      </p>
      <form action={signIn} className="flex flex-col items-center gap-2">
        <label className="flex items-center gap-2 py-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            name="remember"
            defaultChecked={rememberChecked}
            className="h-4 w-4"
          />
          Keep me logged in
        </label>
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
