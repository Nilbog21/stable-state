import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { BlockingLink, NavigationBlockerProvider, useNavigationBlocker } from '../NavigationBlocker'

vi.mock('next/link', () => ({
  default: ({ href, onNavigate, className, children }: {
    href: string
    onNavigate?: (e: { preventDefault: () => void }) => void
    className?: string
    children: React.ReactNode
  }) => (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        onNavigate?.({ preventDefault: () => {} })
      }}
      data-testid="link"
    >
      {children}
    </a>
  ),
}))

afterEach(cleanup)

function PendingNavDisplay() {
  const { pendingNav } = useNavigationBlocker()
  return <div data-testid="pending">{pendingNav ? JSON.stringify(pendingNav) : 'none'}</div>
}

function DirtyToggle() {
  const { setDirty } = useNavigationBlocker()
  return <button data-testid="make-dirty" onClick={() => setDirty(true)}>dirty</button>
}

describe('BlockingLink', () => {
  it('should_not_set_pending_nav_when_not_dirty', () => {
    render(
      <NavigationBlockerProvider>
        <PendingNavDisplay />
        <BlockingLink href="/other">Go</BlockingLink>
      </NavigationBlockerProvider>
    )

    fireEvent.click(screen.getByTestId('link'))

    expect(screen.getByTestId('pending').textContent).toBe('none')
  })

  it('should_set_pending_nav_when_dirty_and_link_clicked', async () => {
    render(
      <NavigationBlockerProvider>
        <DirtyToggle />
        <PendingNavDisplay />
        <BlockingLink href="/other">Go</BlockingLink>
      </NavigationBlockerProvider>
    )

    fireEvent.click(screen.getByTestId('make-dirty'))
    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('none'))

    fireEvent.click(screen.getByTestId('link'))

    expect(screen.getByTestId('pending').textContent).toBe('{"type":"push","href":"/other"}')
  })
})
