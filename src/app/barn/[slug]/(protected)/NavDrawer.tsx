'use client'
import { useEffect, useRef, useState } from 'react'
import { BlockingLink } from './NavigationBlocker'

interface Props {
  navLinks: { href: string; label: string }[]
}

export function NavDrawer({ navLinks }: Props) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) panelRef.current!.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  function close() {
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center text-zinc-900 md:hidden dark:text-zinc-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>
      {open && (
        <>
          <div
            data-testid="nav-drawer-scrim"
            onClick={close}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            tabIndex={-1}
            className="fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto bg-white p-4 shadow-lg outline-none dark:bg-zinc-900"
          >
            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <BlockingLink
                  key={link.href}
                  href={link.href}
                  onClick={close}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-800"
                >
                  {link.label}
                </BlockingLink>
              ))}
            </nav>
          </div>
        </>
      )}
    </>
  )
}
