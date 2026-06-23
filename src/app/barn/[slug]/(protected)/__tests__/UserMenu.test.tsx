import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/app/actions/auth', () => ({
  signOut: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, onClick, onNavigate }: {
    href: string
    children: React.ReactNode
    onClick?: () => void
    onNavigate?: (e: { preventDefault: () => void }) => void
  }) => (
    <a href={href} onClick={() => { onClick?.(); onNavigate?.({ preventDefault: vi.fn() }) }}>{children}</a>
  ),
}))

vi.mock('../NavigationBlocker', () => ({
  useNavigationBlocker: vi.fn(),
}))

import { useNavigationBlocker } from '../NavigationBlocker'
import { UserMenu } from '../UserMenu'

beforeEach(() => {
  vi.mocked(useNavigationBlocker).mockReturnValue({
    dirty: false,
    setDirty: vi.fn(),
    pendingNav: null,
    setPendingNav: vi.fn(),
  })
})

const baseProps = {
  initials: 'JD',
  email: 'jane@example.com',
  fullName: 'Jane Doe',
  showSwitchBarn: false,
}

describe('UserMenu - initials button', () => {
  it('should_render_initials_button', () => {
    render(<UserMenu {...baseProps} />)
    expect(screen.getByRole('button', { name: /user menu/i })).toBeDefined()
  })

  it('should_display_initials_in_button', () => {
    render(<UserMenu {...baseProps} />)
    expect(screen.getByRole('button', { name: /user menu/i }).textContent).toBe('JD')
  })
})

describe('UserMenu - dropdown open state', () => {
  beforeEach(() => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
  })

  it('should_open_dropdown_on_click', () => {
    expect(screen.getByText('Sign out')).toBeDefined()
  })

  it('should_show_full_name_in_dropdown', () => {
    expect(screen.getByText('Jane Doe')).toBeDefined()
  })

  it('should_show_email_in_dropdown', () => {
    expect(screen.getByText('jane@example.com')).toBeDefined()
  })

  it('should_show_sign_out_button_in_dropdown', () => {
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined()
  })
})

describe('UserMenu - dropdown closed state', () => {
  it('should_not_show_dropdown_content_initially', () => {
    render(<UserMenu {...baseProps} />)
    expect(screen.queryByText('Sign out')).toBeNull()
  })
})

describe('UserMenu - Switch Barn link', () => {
  it('should_show_switch_barn_link_when_showSwitchBarn_is_true', () => {
    render(<UserMenu {...baseProps} showSwitchBarn={true} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect(screen.getByRole('link', { name: /switch barn/i })).toBeDefined()
  })

  it('should_not_show_switch_barn_link_when_showSwitchBarn_is_false', () => {
    render(<UserMenu {...baseProps} showSwitchBarn={false} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect(screen.queryByRole('link', { name: /switch barn/i })).toBeNull()
  })

  it('should_switch_barn_link_point_to_barns_route', () => {
    render(<UserMenu {...baseProps} showSwitchBarn={true} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect((screen.getByRole('link', { name: /switch barn/i }) as HTMLAnchorElement).href).toContain('/barns')
  })

  it('should_close_dropdown_when_switch_barn_link_is_clicked', () => {
    render(<UserMenu {...baseProps} showSwitchBarn={true} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    fireEvent.click(screen.getByRole('link', { name: /switch barn/i }))
    expect(screen.queryByText('Sign out')).toBeNull()
  })
})

describe('UserMenu - Profile link', () => {
  it('should_show_profile_link_when_dropdown_is_open', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect(screen.getByRole('link', { name: /profile/i })).toBeDefined()
  })

  it('should_profile_link_point_to_profile_route', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect((screen.getByRole('link', { name: /profile/i }) as HTMLAnchorElement).href).toContain('/profile')
  })

  it('should_close_dropdown_when_profile_link_is_clicked', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    fireEvent.click(screen.getByRole('link', { name: /profile/i }))
    expect(screen.queryByText('Sign out')).toBeNull()
  })
})

describe('UserMenu - outside click/touch closes dropdown', () => {
  it('should_close_dropdown_on_outside_click', () => {
    render(
      <div>
        <UserMenu {...baseProps} />
        <button data-testid="outside">outside</button>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('Sign out')).toBeNull()
  })

  it('should_close_dropdown_on_outside_touch', () => {
    render(
      <div>
        <UserMenu {...baseProps} />
        <button data-testid="outside">outside</button>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    fireEvent.touchStart(screen.getByTestId('outside'))
    expect(screen.queryByText('Sign out')).toBeNull()
  })
})

describe('UserMenu - dirty navigation intercepted from Profile link', () => {
  it('should_call_setPendingNav_with_profile_href_when_dirty', () => {
    const setPendingNav = vi.fn()
    vi.mocked(useNavigationBlocker).mockReturnValue({ dirty: true, setDirty: vi.fn(), pendingNav: null, setPendingNav })
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    fireEvent.click(screen.getByRole('link', { name: /profile/i }))
    expect(setPendingNav).toHaveBeenCalledWith({ type: 'push', href: '/profile' })
  })
})

describe('UserMenu - dirty navigation intercepted from Switch Barn link', () => {
  it('should_call_setPendingNav_with_barns_href_when_dirty', () => {
    const setPendingNav = vi.fn()
    vi.mocked(useNavigationBlocker).mockReturnValue({ dirty: true, setDirty: vi.fn(), pendingNav: null, setPendingNav })
    render(<UserMenu {...baseProps} showSwitchBarn={true} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    fireEvent.click(screen.getByRole('link', { name: /switch barn/i }))
    expect(setPendingNav).toHaveBeenCalledWith({ type: 'push', href: '/barns' })
  })
})
