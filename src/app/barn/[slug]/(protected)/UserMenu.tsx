'use client'
import { useOutsideDismiss } from '@/components/useOutsideDismiss'
import { signOut } from '@/app/actions/auth'
import { useNavigationBlocker } from './NavigationBlocker'
import Link from 'next/link'

interface Props {
  initials: string
  email: string
  fullName: string | null
  barnSlug: string
  showSwitchBarn?: boolean
}

export function UserMenu({ initials, email, fullName, barnSlug, showSwitchBarn }: Props) {
  const { open, setOpen, ref } = useOutsideDismiss()
  const { dirty, setPendingNav } = useNavigationBlocker()

  return (
    <div ref={ref} className="relative">
      {/* Raw Tailwind, not <Button>: fixed-content circular avatar/initials
          trigger — no Button variant targets this shape. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="User menu"
        aria-expanded={open}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-white dark:bg-zinc-200 dark:text-zinc-900"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-10 min-w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-md dark:border-zinc-700 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-4 py-2 dark:border-zinc-800">
            {fullName && (
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{fullName}</p>
            )}
            <p className="text-xs text-zinc-500">{email}</p>
          </div>
          <Link
            href={`/profile?barn=${barnSlug}`}
            onClick={() => setOpen(false)}
            onNavigate={(e) => {
              if (dirty) {
                e.preventDefault()
                setOpen(false)
                setPendingNav({ type: 'push', href: `/profile?barn=${barnSlug}` })
              }
            }}
            className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Profile
          </Link>
          {showSwitchBarn && (
            <Link
              href="/barns"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Switch Barn
            </Link>
          )}
          <Link
            href={`/barn/${barnSlug}/guide`}
            onClick={() => setOpen(false)}
            onNavigate={(e) => {
              if (dirty) {
                e.preventDefault()
                setOpen(false)
                setPendingNav({ type: 'push', href: `/barn/${barnSlug}/guide` })
              }
            }}
            className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            User Guide
          </Link>
          <Link
            href="/about"
            onClick={() => setOpen(false)}
            onNavigate={(e) => {
              if (dirty) {
                e.preventDefault()
                setOpen(false)
                setPendingNav({ type: 'push', href: '/about' })
              }
            }}
            className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            About
          </Link>
          {/* Raw Tailwind, not <Button>: styled identically to the sibling
              Link menu rows above (Profile/Switch Barn/User Guide) — a
              dropdown menu-item pattern, not a button pattern. */}
          <form action={signOut}>
            <button
              type="submit"
              className="w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
