'use client'
import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { signOut } from '@/app/actions/auth'

interface Props {
  initials: string
  email: string
  fullName: string | null
  showSwitchBarn: boolean
}

export function UserMenu({ initials, email, fullName, showSwitchBarn }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function close(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [])

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="User menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-white dark:bg-zinc-200 dark:text-zinc-900"
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
          {showSwitchBarn && (
            <Link
              href="/barns"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Switch Barn
            </Link>
          )}
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
