import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { BlockingLink, NavigationBlockerProvider, NavigationConfirmDialog, useNavigationBlocker } from '../NavigationBlocker'

const mockPush = vi.fn()
const mockBack = vi.fn()

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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}))

afterEach(cleanup)
beforeEach(() => { mockPush.mockReset(); mockBack.mockReset() })

function PendingNavDisplay() {
  const { pendingNav } = useNavigationBlocker()
  return <div data-testid="pending">{pendingNav ? JSON.stringify(pendingNav) : 'none'}</div>
}

function DirtyToggle() {
  const { setDirty } = useNavigationBlocker()
  return <button data-testid="make-dirty" onClick={() => setDirty(true)}>dirty</button>
}

function SetPendingNavButton({ href }: { href: string }) {
  const { setDirty, setPendingNav, setMessage } = useNavigationBlocker()
  return (
    <button
      data-testid="set-pending"
      onClick={() => {
        setDirty(true)
        setMessage('Test message')
        setPendingNav({ type: 'push', href })
      }}
    >
      block
    </button>
  )
}

function SetBackNavButton() {
  const { setDirty, setPendingNav, setMessage } = useNavigationBlocker()
  return (
    <button
      data-testid="set-back"
      onClick={() => {
        setDirty(true)
        setMessage('Test message')
        setPendingNav({ type: 'back' })
      }}
    >
      back
    </button>
  )
}

function SetOnLeaveButton({ onLeaveFn }: { onLeaveFn: () => void }) {
  const { setOnLeave } = useNavigationBlocker()
  return (
    <button data-testid="set-onleave" onClick={() => setOnLeave(onLeaveFn)}>
      register
    </button>
  )
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

describe('NavigationConfirmDialog', () => {
  it('should_not_render_dialog_when_pending_nav_is_null', () => {
    render(
      <NavigationBlockerProvider>
        <NavigationConfirmDialog />
      </NavigationBlockerProvider>
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('should_render_dialog_when_pending_nav_is_set', () => {
    render(
      <NavigationBlockerProvider>
        <SetPendingNavButton href="/other" />
        <NavigationConfirmDialog />
      </NavigationBlockerProvider>
    )
    fireEvent.click(screen.getByTestId('set-pending'))
    expect(screen.queryByRole('dialog')).not.toBeNull()
  })

  it('should_display_message_from_context_in_dialog', () => {
    render(
      <NavigationBlockerProvider>
        <SetPendingNavButton href="/other" />
        <NavigationConfirmDialog />
      </NavigationBlockerProvider>
    )
    fireEvent.click(screen.getByTestId('set-pending'))
    expect(screen.getByRole('dialog').textContent).toContain('Test message')
  })

  it('should_clear_pending_nav_on_stay_click', () => {
    render(
      <NavigationBlockerProvider>
        <SetPendingNavButton href="/other" />
        <PendingNavDisplay />
        <NavigationConfirmDialog />
      </NavigationBlockerProvider>
    )
    fireEvent.click(screen.getByTestId('set-pending'))
    fireEvent.click(screen.getByRole('button', { name: /stay/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('should_navigate_on_leave_click', () => {
    render(
      <NavigationBlockerProvider>
        <SetPendingNavButton href="/destination" />
        <NavigationConfirmDialog />
      </NavigationBlockerProvider>
    )
    fireEvent.click(screen.getByTestId('set-pending'))
    fireEvent.click(screen.getByRole('button', { name: /leave/i }))
    expect(mockPush).toHaveBeenCalledWith('/destination')
  })

  it('should_set_dirty_false_on_leave_click', () => {
    function DirtyDisplay() {
      const { dirty } = useNavigationBlocker()
      return <div data-testid="dirty">{dirty ? 'dirty' : 'clean'}</div>
    }
    render(
      <NavigationBlockerProvider>
        <SetPendingNavButton href="/other" />
        <DirtyDisplay />
        <NavigationConfirmDialog />
      </NavigationBlockerProvider>
    )
    fireEvent.click(screen.getByTestId('set-pending'))
    fireEvent.click(screen.getByRole('button', { name: /leave/i }))
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_clear_pending_nav_on_leave_click', () => {
    render(
      <NavigationBlockerProvider>
        <SetPendingNavButton href="/other" />
        <NavigationConfirmDialog />
      </NavigationBlockerProvider>
    )
    fireEvent.click(screen.getByTestId('set-pending'))
    fireEvent.click(screen.getByRole('button', { name: /leave/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('should_call_onLeave_instead_of_router_push_when_registered', () => {
    const customLeave = vi.fn()
    render(
      <NavigationBlockerProvider>
        <SetPendingNavButton href="/other" />
        <SetOnLeaveButton onLeaveFn={customLeave} />
        <NavigationConfirmDialog />
      </NavigationBlockerProvider>
    )
    fireEvent.click(screen.getByTestId('set-pending'))
    fireEvent.click(screen.getByTestId('set-onleave'))
    fireEvent.click(screen.getByRole('button', { name: /leave/i }))
    expect(customLeave).toHaveBeenCalled()
  })

  it('should_not_call_router_push_when_onLeave_is_registered', () => {
    const customLeave = vi.fn()
    render(
      <NavigationBlockerProvider>
        <SetPendingNavButton href="/other" />
        <SetOnLeaveButton onLeaveFn={customLeave} />
        <NavigationConfirmDialog />
      </NavigationBlockerProvider>
    )
    fireEvent.click(screen.getByTestId('set-pending'))
    fireEvent.click(screen.getByTestId('set-onleave'))
    fireEvent.click(screen.getByRole('button', { name: /leave/i }))
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('should_call_router_back_for_type_back_when_no_onLeave', () => {
    render(
      <NavigationBlockerProvider>
        <SetBackNavButton />
        <NavigationConfirmDialog />
      </NavigationBlockerProvider>
    )
    fireEvent.click(screen.getByTestId('set-back'))
    fireEvent.click(screen.getByRole('button', { name: /leave/i }))
    expect(mockBack).toHaveBeenCalled()
  })
})
