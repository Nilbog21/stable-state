import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/app/actions/auth', () => ({
  signOut: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>{children}</a>
  ),
}))

import { UserMenu } from '../UserMenu'

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
