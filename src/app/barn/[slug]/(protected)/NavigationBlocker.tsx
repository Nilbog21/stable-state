'use client'

import { createContext, useContext, useState } from 'react'
import Link from 'next/link'

export type PendingNav = { type: 'push'; href: string } | { type: 'back' } | null

type Ctx = {
  dirty: boolean
  setDirty: (v: boolean) => void
  pendingNav: PendingNav
  setPendingNav: (nav: PendingNav) => void
}

const NavigationBlockerContext = createContext<Ctx>({
  dirty: false,
  setDirty: () => {},
  pendingNav: null,
  setPendingNav: () => {},
})

export function useNavigationBlocker() {
  return useContext(NavigationBlockerContext)
}

export function NavigationBlockerProvider({ children }: { children: React.ReactNode }) {
  const [dirty, setDirty] = useState(false)
  const [pendingNav, setPendingNav] = useState<PendingNav>(null)
  return (
    <NavigationBlockerContext.Provider value={{ dirty, setDirty, pendingNav, setPendingNav }}>
      {children}
    </NavigationBlockerContext.Provider>
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
