'use client'

import { createContext, useCallback, useContext, useState } from 'react'
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
  onLeave: (() => void) | null
  setOnLeave: (fn: (() => void) | null) => void
}

const NavigationBlockerContext = createContext<Ctx>({
  dirty: false,
  setDirty: () => {},
  pendingNav: null,
  setPendingNav: () => {},
  message: '',
  setMessage: () => {},
  onLeave: null,
  setOnLeave: () => {},
})

export function useNavigationBlocker() {
  return useContext(NavigationBlockerContext)
}

export function NavigationBlockerProvider({ children }: { children: React.ReactNode }) {
  const [dirty, setDirty] = useState(false)
  const [pendingNav, setPendingNav] = useState<PendingNav>(null)
  const [message, setMessage] = useState('')
  const [onLeaveState, setOnLeaveState] = useState<(() => void) | null>(null)
  const setOnLeave = useCallback((fn: (() => void) | null) => {
    setOnLeaveState(fn === null ? null : () => fn)
  }, [])
  return (
    <NavigationBlockerContext.Provider value={{ dirty, setDirty, pendingNav, setPendingNav, message, setMessage, onLeave: onLeaveState, setOnLeave }}>
      {children}
    </NavigationBlockerContext.Provider>
  )
}

export function NavigationConfirmDialog() {
  const { pendingNav, setPendingNav, setDirty, message, onLeave, setOnLeave } = useNavigationBlocker()
  const router = useRouter()

  if (!pendingNav) return null

  function handleLeave() {
    const nav = pendingNav
    setDirty(false)
    setPendingNav(null)
    setOnLeave(null)
    if (onLeave) {
      onLeave()
    } else if (nav?.type === 'push') {
      router.push(nav.href)
    } else if (nav?.type === 'back') {
      router.back()
    }
  }

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900">
        <p className="mb-6 text-sm text-zinc-900 dark:text-zinc-50">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setPendingNav(null)}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
          >
            Stay
          </button>
          <button
            type="button"
            onClick={handleLeave}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 active:bg-zinc-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:active:bg-zinc-300"
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
  onClick,
  'aria-current': ariaCurrent,
}: {
  href: string
  className?: string
  children: React.ReactNode
  onClick?: () => void
  'aria-current'?: 'page'
}) {
  const { dirty, setPendingNav } = useNavigationBlocker()
  return (
    <Link
      href={href}
      className={className}
      onClick={onClick}
      aria-current={ariaCurrent}
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
