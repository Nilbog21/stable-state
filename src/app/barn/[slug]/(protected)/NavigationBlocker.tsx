'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'

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

/**
 * Arms the nav guard while `dirty` is true: sets the context flag and dialog message, and
 * warns on tab close via beforeunload. Cleans up on disarm and on unmount, so forms whose
 * successful save redirects away clear the guard for free.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const { setDirty, setMessage } = useNavigationBlocker()
  useEffect(() => {
    setDirty(dirty)
    if (dirty) setMessage('You have unsaved changes. Leave without saving?')
    return () => setDirty(false)
  }, [dirty, setDirty, setMessage])

  useEffect(() => {
    if (!dirty) return
    function handler(e: BeforeUnloadEvent) { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
}

/**
 * Guard-armed <form> for server components: any bubbled change from the field children arms
 * the guard, submit clears it. Suits void-returning actions with no error UI — after submit
 * the fields hold exactly what was sent, so nothing is unsaved even if the page stays.
 */
export function GuardedForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>
  className?: string
  children: React.ReactNode
}) {
  const [dirty, setDirty] = useState(false)
  useUnsavedChangesGuard(dirty)
  return (
    <form action={action} className={className} onChange={() => setDirty(true)} onSubmit={() => setDirty(false)}>
      {children}
    </form>
  )
}

export function NavigationConfirmDialog() {
  const { pendingNav, setPendingNav, setDirty, message, onLeave, setOnLeave } = useNavigationBlocker()
  const router = useRouter()

  // Escape resolves as Stay — the non-destructive choice, exactly what the Stay button does.
  // Listening on the document rather than on the dialog element because the dialog has no focus
  // trap: focus can be tabbed out of it, and a container-scoped handler would go silently dead
  // the moment that happened.
  useEffect(() => {
    if (!pendingNav) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPendingNav(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [pendingNav, setPendingNav])

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
          <Button variant="ghost" onClick={handleLeave}>
            Leave
          </Button>
          {/* Rightmost, primary, and focused on open: Stay is the safe choice, so it carries the
              emphasis and is what Enter activates. */}
          <Button autoFocus onClick={() => setPendingNav(null)}>
            Stay
          </Button>
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
