export function GoogleSignInButton({
  action,
  rememberChecked,
}: {
  action: (formData: FormData) => void | Promise<void>
  rememberChecked: boolean
}) {
  return (
    <form action={action} className="flex flex-col items-center gap-2">
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
  )
}
