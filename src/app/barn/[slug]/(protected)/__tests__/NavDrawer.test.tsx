import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useEffect } from 'react'

afterEach(cleanup)

const mockUsePathname = vi.hoisted(() => vi.fn(() => '/barn/test-barn/lessons'))
const mockUseSearchParams = vi.hoisted(() => vi.fn(() => new URLSearchParams('')))

beforeEach(() => {
  mockUsePathname.mockReset()
  mockUsePathname.mockReturnValue('/barn/test-barn/lessons')
  mockUseSearchParams.mockReset()
  mockUseSearchParams.mockReturnValue(new URLSearchParams(''))
})

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
  useSearchParams: mockUseSearchParams,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, onClick, onNavigate }: {
    href: string
    children: React.ReactNode
    onClick?: () => void
    onNavigate?: (e: { preventDefault: () => void }) => void
  }) => (
    <a href={href} onClick={(e) => { onNavigate?.({ preventDefault: () => e.preventDefault() }); onClick?.() }}>{children}</a>
  ),
}))

import { NavigationBlockerProvider, useNavigationBlocker } from '../NavigationBlocker'
import { NavDrawer } from '../NavDrawer'

const navLinks = [
  { href: '/barn/test-barn/lessons', label: 'Lessons' },
  { href: '/barn/test-barn/horses', label: 'Horses' },
  { href: '/barn/test-barn/guide', label: 'Guide' },
]

function renderDrawer() {
  render(
    <NavigationBlockerProvider>
      <NavDrawer navLinks={navLinks} />
    </NavigationBlockerProvider>
  )
}

function DirtyFlag() {
  const { setDirty } = useNavigationBlocker()
  useEffect(() => setDirty(true), [setDirty])
  return null
}

describe('NavDrawer - trigger button', () => {
  it('should_render_hamburger_trigger_button', () => {
    renderDrawer()
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toBeDefined()
  })

  it('should_have_aria_expanded_false_by_default', () => {
    renderDrawer()
    expect(screen.getByRole('button', { name: /open navigation menu/i }).getAttribute('aria-expanded')).toBe('false')
  })

  it('should_have_aria_expanded_true_when_open', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    expect(screen.getByRole('button', { name: /open navigation menu/i }).getAttribute('aria-expanded')).toBe('true')
  })
})

describe('NavDrawer - opening', () => {
  it('should_not_render_drawer_panel_by_default', () => {
    renderDrawer()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('should_open_drawer_when_trigger_is_clicked', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('should_render_lessons_link_when_open', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    expect(screen.getByRole('link', { name: 'Lessons' })).toBeDefined()
  })

  it('should_render_horses_link_when_open', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    expect(screen.getByRole('link', { name: 'Horses' })).toBeDefined()
  })

  it('should_render_guide_link_when_open', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    expect(screen.getByRole('link', { name: 'Guide' })).toBeDefined()
  })

  it('should_render_nav_links_as_blocking_links_pointing_to_their_href', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    expect((screen.getByRole('link', { name: 'Lessons' }) as HTMLAnchorElement).href).toContain('/barn/test-barn/lessons')
  })
})

describe('NavDrawer - closing', () => {
  it('should_close_drawer_when_a_link_is_tapped', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    fireEvent.click(screen.getByRole('link', { name: 'Lessons' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('should_close_drawer_when_scrim_is_tapped', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    fireEvent.click(screen.getByTestId('nav-drawer-scrim'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('should_close_drawer_when_escape_key_is_pressed', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('should_not_close_drawer_when_a_non_escape_key_is_pressed', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('should_close_drawer_when_pathname_changes', () => {
    const { rerender } = render(
      <NavigationBlockerProvider>
        <NavDrawer navLinks={navLinks} />
      </NavigationBlockerProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    mockUsePathname.mockReturnValue('/barn/test-barn/horses')
    rerender(
      <NavigationBlockerProvider>
        <NavDrawer navLinks={navLinks} />
      </NavigationBlockerProvider>
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('NavDrawer - focus management', () => {
  it('should_move_focus_to_drawer_panel_when_opened', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })
})

describe('NavDrawer - accessibility', () => {
  it('should_render_drawer_panel_with_dialog_role_and_aria_modal', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
  })

  it('should_label_trigger_for_screen_readers', () => {
    renderDrawer()
    expect(screen.getByRole('button', { name: /open navigation menu/i }).getAttribute('aria-label')).toBe('Open navigation menu')
  })
})

describe('NavDrawer - active link highlighting', () => {
  it('should_mark_matching_pathname_link_as_current_page', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    expect(screen.getByRole('link', { name: 'Lessons' }).getAttribute('aria-current')).toBe('page')
  })

  it('should_not_mark_non_matching_link_as_current_page', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    expect(screen.getByRole('link', { name: 'Horses' }).getAttribute('aria-current')).toBeNull()
  })

  it('should_apply_active_background_class_to_matching_link', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    expect(screen.getByRole('link', { name: 'Lessons' }).className).toContain('bg-zinc-100')
  })
})

describe('NavDrawer - unsaved-changes guard', () => {
  it('should_set_pending_nav_instead_of_navigating_when_dirty_and_link_is_tapped', () => {
    function Harness() {
      return (
        <NavigationBlockerProvider>
          <DirtyFlag />
          <PendingNavProbe />
          <NavDrawer navLinks={navLinks} />
        </NavigationBlockerProvider>
      )
    }
    function PendingNavProbe() {
      const { pendingNav } = useNavigationBlocker()
      return <div data-testid="pending-nav">{pendingNav ? JSON.stringify(pendingNav) : ''}</div>
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    fireEvent.click(screen.getByRole('link', { name: 'Lessons' }))
    expect(screen.getByTestId('pending-nav').textContent).toContain('/barn/test-barn/lessons')
  })

  it('should_close_drawer_immediately_on_link_tap_even_when_dirty', () => {
    render(
      <NavigationBlockerProvider>
        <DirtyFlag />
        <NavDrawer navLinks={navLinks} />
      </NavigationBlockerProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }))
    fireEvent.click(screen.getByRole('link', { name: 'Lessons' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
