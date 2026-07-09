import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { getBarnBySlug } from '@/lib/db/barns'
import { signInWithGoogleForBarn } from '@/app/actions/auth'
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton'

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
      <GoogleSignInButton action={signIn} rememberChecked={rememberChecked} />
    </main>
  )
}
