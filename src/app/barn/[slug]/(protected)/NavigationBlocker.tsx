'use client'

import { createContext, useContext, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export type PendingNav = { type: 'push'; href: string } | { type: 'back' } | null

type Ctx = {
  dirty: boolean
  setDirty: (v: boolean) => void
  pendingNav: PendingNav
  setPendingNav: (nav: PendingNav) => void
  message: string
  setMessage: (m: string) => void
}

const NavigationBlockerContext = createContext<Ctx>({
  dirty: false,
  setDirty: () => {},
  pendingNav: null,
  setPendingNav: () => {},
  message: '',
  setMessage: () => {},
})

export function useNavigationBlocker() {
  return useContext(NavigationBlockerContext)
}

export function NavigationBlockerProvider({ children }: { children: React.ReactNode }) {
  const [dirty, setDirty] = useState(false)
  const [pendingNav, setPendingNav] = useState<PendingNav>(null)
  const [message, setMessage] = useState('')
  return (
    <NavigationBlockerContext.Provider value={{ dirty, setDirty, pendingNav, setPendingNav, message, setMessage }}>
      {children}
    </NavigationBlockerContext.Provider>
  )
}

export function NavigationConfirmDialog() {
  const { pendingNav, setPendingNav, setDirty, message } = useNavigationBlocker()
  const router = useRouter()

  if (!pendingNav) return null

  function handleLeave() {
    if (pendingNav?.type === 'push') router.push(pendingNav.href)
    setDirty(false)
    setPendingNav(null)
  }

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900">
        <p className="mb-6 text-sm text-zinc-900 dark:text-zinc-50">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setPendingNav(null)}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Stay
          </button>
          <button
            type="button"
            onClick={handleLeave}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}

export function BlockingLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  const { dirty, setPendingNav } = useNavigationBlocker()
  return (
    <Link
      href={href}
      className={className}
      onNavigate={(e) => {
        if (dirty) {
          e.preventDefault()
          setPendingNav({ type: 'push', href })
        }
      }}
    >
      {children}
    </Link>
  )
}
