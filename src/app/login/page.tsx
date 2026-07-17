import { cookies } from 'next/headers'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { signInWithGoogle, signOut } from '@/app/actions/auth'
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton'
import { Button } from '@/components/ui/Button'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ no_barns?: string }>
}) {
  const { no_barns } = await searchParams
  const user = await getAuthenticatedUser()
  const showGuidance = no_barns === 'true' && user !== null
  const connected = !!process.env.NEXT_PUBLIC_SUPABASE_URL
  const rememberPref = (await cookies()).get('remember_me_pref')?.value
  const rememberChecked = rememberPref !== '0'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Stable State
      </h1>
      <p className="text-lg text-zinc-500 dark:text-zinc-400">
        Lesson &amp; horse management
      </p>
      <div className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm">
        <span
          className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-yellow-400'}`}
        />
        <span className="text-zinc-600 dark:text-zinc-300">
          {connected ? 'Supabase connected' : 'Supabase env vars not set — add .env.local'}
        </span>
      </div>
      {showGuidance ? (
        <>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            You&apos;re not a member of any barn yet. Ask your barn manager for an invite link.
          </p>
          <form action={signOut}>
            <Button type="submit">Sign out</Button>
          </form>
        </>
      ) : (
        <GoogleSignInButton action={signInWithGoogle} rememberChecked={rememberChecked} />
      )}
      <a
        href="/terms"
        className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        Terms of Service
      </a>
    </main>
  )
}
