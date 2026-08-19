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
    <a href={href} onClick={(e) => { onNavigate?.({ preventDefault: () => e.preventDefault() }); onClick?.() }}>{children}</a>
  ),
}))

vi.mock('../NavigationBlocker', () => ({
  useNavigationBlocker: vi.fn(() => ({ dirty: false, markDirty: vi.fn(), pendingNav: null, setPendingNav: vi.fn() })),
}))

import { useNavigationBlocker } from '../NavigationBlocker'
import { UserMenu } from '../UserMenu'

beforeEach(() => {
  vi.mocked(useNavigationBlocker).mockReturnValue({
    dirty: false,
    markDirty: vi.fn(),
    clearAllDirty: vi.fn(),
    pendingNav: null,
    setPendingNav: vi.fn(),
    message: '',
    onLeave: null,
    setOnLeave: vi.fn(),
  })
})

const baseProps = {
  initials: 'JD',
  email: 'jane@example.com',
  fullName: 'Jane Doe',
  barnSlug: 'test-barn',
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

describe('UserMenu - demo mode', () => {
  it('should_hide_profile_link_when_isDemoUser_true', () => {
    render(<UserMenu {...baseProps} isDemoUser />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull()
  })

  it('should_show_profile_link_when_isDemoUser_omitted', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect(screen.getByRole('link', { name: 'Profile' })).toBeDefined()
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


describe('UserMenu - Profile link', () => {
  it('should_show_profile_link_when_dropdown_is_open', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect(screen.getByRole('link', { name: /profile/i })).toBeDefined()
  })

  it('should_profile_link_point_to_profile_route_with_barn_param', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect((screen.getByRole('link', { name: /profile/i }) as HTMLAnchorElement).href).toContain('/profile?barn=test-barn')
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

describe('UserMenu - Switch Barn link', () => {
  it('should_show_switch_barn_link_when_show_switch_barn_is_true', () => {
    render(<UserMenu {...baseProps} showSwitchBarn />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect(screen.getByRole('link', { name: /switch barn/i })).toBeDefined()
  })

  it('should_close_dropdown_when_switch_barn_link_is_clicked', () => {
    render(<UserMenu {...baseProps} showSwitchBarn />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    fireEvent.click(screen.getByRole('link', { name: /switch barn/i }))
    expect(screen.queryByText('Sign out')).toBeNull()
  })

  it('should_not_show_switch_barn_link_when_show_switch_barn_is_false', () => {
    render(<UserMenu {...baseProps} showSwitchBarn={false} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect(screen.queryByRole('link', { name: /switch barn/i })).toBeNull()
  })
})

describe('UserMenu - User Guide link', () => {
  it('should_show_user_guide_link_when_dropdown_is_open', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect(screen.getByRole('link', { name: /user guide/i })).toBeDefined()
  })

  it('should_user_guide_link_point_to_barn_guide_route', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect((screen.getByRole('link', { name: /user guide/i }) as HTMLAnchorElement).href).toContain('/barn/test-barn/guide')
  })

  it('should_close_dropdown_when_user_guide_link_is_clicked', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    fireEvent.click(screen.getByRole('link', { name: /user guide/i }))
    expect(screen.queryByText('Sign out')).toBeNull()
  })

  it('should_user_guide_link_appear_before_sign_out_button', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    const guideLink = screen.getByRole('link', { name: /user guide/i })
    const signOutButton = screen.getByRole('button', { name: /sign out/i })
    expect(guideLink.compareDocumentPosition(signOutButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })


})

describe('UserMenu - About link', () => {
  it('should_show_about_link_when_dropdown_is_open', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect(screen.getByRole('link', { name: /about/i })).toBeDefined()
  })

  it('should_about_link_point_to_about_route', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect((screen.getByRole('link', { name: /about/i }) as HTMLAnchorElement).href).toContain('/about')
  })

  it('should_close_dropdown_when_about_link_is_clicked', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    fireEvent.click(screen.getByRole('link', { name: /about/i }))
    expect(screen.queryByText('Sign out')).toBeNull()
  })

  it('should_about_link_appear_between_user_guide_and_sign_out', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    const guideLink = screen.getByRole('link', { name: /user guide/i })
    const aboutLink = screen.getByRole('link', { name: /about/i })
    const signOutButton = screen.getByRole('button', { name: /sign out/i })
    expect(guideLink.compareDocumentPosition(aboutLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(aboutLink.compareDocumentPosition(signOutButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('UserMenu - dirty navigation blocking', () => {
  const mockSetPendingNav = vi.fn()

  beforeEach(() => {
    vi.mocked(useNavigationBlocker).mockReturnValue({
      dirty: true,
      markDirty: vi.fn(),
      pendingNav: null,
      setPendingNav: mockSetPendingNav,
    } as any)
  })

  afterEach(() => {
    mockSetPendingNav.mockReset()
    vi.mocked(useNavigationBlocker).mockReturnValue({
      dirty: false,
      markDirty: vi.fn(),
      pendingNav: null,
      setPendingNav: vi.fn(),
    } as any)
  })

  it('should_set_pending_nav_to_profile_with_barn_param_when_dirty_and_profile_link_clicked', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    fireEvent.click(screen.getByRole('link', { name: /profile/i }))
    expect(mockSetPendingNav).toHaveBeenCalledWith({ type: 'push', href: '/profile?barn=test-barn' })
  })

  it('should_set_pending_nav_to_guide_when_dirty_and_user_guide_link_clicked', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    fireEvent.click(screen.getByRole('link', { name: /user guide/i }))
    expect(mockSetPendingNav).toHaveBeenCalledWith({ type: 'push', href: '/barn/test-barn/guide' })
  })

  it('should_set_pending_nav_to_about_when_dirty_and_about_link_clicked', () => {
    render(<UserMenu {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    fireEvent.click(screen.getByRole('link', { name: /about/i }))
    expect(mockSetPendingNav).toHaveBeenCalledWith({ type: 'push', href: '/about' })
  })
})
