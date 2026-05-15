import { signInWithGoogle } from '@/app/actions/auth'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Stable State
      </h1>
      <p className="text-lg text-zinc-500 dark:text-zinc-400">
        Lesson &amp; horse management
      </p>
      <form action={signInWithGoogle}>
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
