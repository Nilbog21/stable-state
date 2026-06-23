import { getAuthenticatedUser } from '@/lib/db/auth'
import { signInWithGoogle, signOut } from '@/app/actions/auth'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ no_barns?: string }>
}) {
  const { no_barns } = await searchParams
  const user = await getAuthenticatedUser()
  const showGuidance = no_barns === 'true' && user !== null
  const connected = !!process.env.NEXT_PUBLIC_SUPABASE_URL

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
            <button
              type="submit"
              className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-6 py-3 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </form>
        </>
      ) : (
        <form action={signInWithGoogle}>
          <button
            type="submit"
            className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-6 py-3 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            Sign in with Google
          </button>
        </form>
      )}
    </main>
  )
}
