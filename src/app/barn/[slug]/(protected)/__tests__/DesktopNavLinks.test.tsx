import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

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
  default: ({ href, children, onNavigate, className, 'aria-current': ariaCurrent }: {
    href: string
    children: React.ReactNode
    onNavigate?: (e: { preventDefault: () => void }) => void
    className?: string
    'aria-current'?: 'page'
  }) => (
    <a href={href} className={className} aria-current={ariaCurrent} onClick={(e) => onNavigate?.({ preventDefault: () => e.preventDefault() })}>{children}</a>
  ),
}))

import { NavigationBlockerProvider } from '../NavigationBlocker'
import { DesktopNavLinks } from '../DesktopNavLinks'

const navLinks = [
  { href: '/barn/test-barn/lessons', label: 'Lessons' },
  { href: '/barn/test-barn/horses', label: 'Horses' },
  { href: '/barn/test-barn/agreements?kind=lease', label: 'Leases' },
  { href: '/barn/test-barn/agreements?kind=board', label: 'Boarding' },
]

function renderLinks() {
  render(
    <NavigationBlockerProvider>
      <DesktopNavLinks navLinks={navLinks} />
    </NavigationBlockerProvider>
  )
}

describe('DesktopNavLinks', () => {
  it('should_render_lessons_link', () => {
    renderLinks()
    expect(screen.getByRole('link', { name: 'Lessons' })).toBeDefined()
  })

  it('should_render_horses_link', () => {
    renderLinks()
    expect(screen.getByRole('link', { name: 'Horses' })).toBeDefined()
  })

  it('should_mark_matching_pathname_link_as_current_page', () => {
    renderLinks()
    expect(screen.getByRole('link', { name: 'Lessons' }).getAttribute('aria-current')).toBe('page')
  })

  it('should_not_mark_non_matching_link_as_current_page', () => {
    renderLinks()
    expect(screen.getByRole('link', { name: 'Horses' }).getAttribute('aria-current')).toBeNull()
  })

  it('should_apply_active_font_weight_class_to_matching_link', () => {
    renderLinks()
    expect(screen.getByRole('link', { name: 'Lessons' }).className).toContain('font-semibold')
  })

  it('should_apply_inactive_font_weight_class_to_non_matching_link', () => {
    renderLinks()
    expect(screen.getByRole('link', { name: 'Horses' }).className).toContain('font-medium')
  })

  it('should_mark_leases_active_when_current_query_is_kind_lease', () => {
    mockUsePathname.mockReturnValue('/barn/test-barn/agreements')
    mockUseSearchParams.mockReturnValue(new URLSearchParams('kind=lease'))
    renderLinks()
    expect(screen.getByRole('link', { name: 'Leases' }).getAttribute('aria-current')).toBe('page')
  })

  it('should_not_mark_boarding_active_when_current_query_is_kind_lease', () => {
    mockUsePathname.mockReturnValue('/barn/test-barn/agreements')
    mockUseSearchParams.mockReturnValue(new URLSearchParams('kind=lease'))
    renderLinks()
    expect(screen.getByRole('link', { name: 'Boarding' }).getAttribute('aria-current')).toBeNull()
  })

  it('should_mark_boarding_active_when_current_query_is_kind_board', () => {
    mockUsePathname.mockReturnValue('/barn/test-barn/agreements')
    mockUseSearchParams.mockReturnValue(new URLSearchParams('kind=board'))
    renderLinks()
    expect(screen.getByRole('link', { name: 'Boarding' }).getAttribute('aria-current')).toBe('page')
  })

  it('should_not_mark_leases_active_when_current_query_is_kind_board', () => {
    mockUsePathname.mockReturnValue('/barn/test-barn/agreements')
    mockUseSearchParams.mockReturnValue(new URLSearchParams('kind=board'))
    renderLinks()
    expect(screen.getByRole('link', { name: 'Leases' }).getAttribute('aria-current')).toBeNull()
  })
})
