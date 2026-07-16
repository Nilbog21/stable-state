import { Button } from '@/components/ui/Button'

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
      <Button type="submit">Sign in with Google</Button>
    </form>
  )
}
