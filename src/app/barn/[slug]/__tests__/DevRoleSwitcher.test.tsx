import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}))

vi.mock('@/app/actions/dev-role', () => ({
  setDevRoleOverride: vi.fn(),
  clearDevRoleOverride: vi.fn(),
}))

import { usePathname } from 'next/navigation'
import { setDevRoleOverride, clearDevRoleOverride } from '@/app/actions/dev-role'
import { DevRoleSwitcher } from '../DevRoleSwitcher'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(usePathname).mockReturnValue('/barn/green-acres')
})

describe('DevRoleSwitcher', () => {
  it('should_show_manager_label_when_no_override', () => {
    render(<DevRoleSwitcher currentOverride={null} />)
    expect(screen.getByText(/Dev: manager/i)).toBeDefined()
  })

  it('should_show_override_role_label_when_override_set', () => {
    render(<DevRoleSwitcher currentOverride="trainer" />)
    expect(screen.getByText(/Dev: trainer/i)).toBeDefined()
  })

  it('should_render_two_role_buttons', () => {
    render(<DevRoleSwitcher currentOverride={null} />)
    expect(screen.getByRole('button', { name: 'trainer' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'rider' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'manager' })).toBeNull()
  })

  it('should_disable_button_for_current_override_role', () => {
    render(<DevRoleSwitcher currentOverride="trainer" />)
    const trainerBtn = screen.getByRole('button', { name: 'trainer' }) as HTMLButtonElement
    expect(trainerBtn.disabled).toBe(true)
    const riderBtn = screen.getByRole('button', { name: 'rider' }) as HTMLButtonElement
    expect(riderBtn.disabled).toBe(false)
  })

  it('should_not_show_reset_button_when_no_override', () => {
    render(<DevRoleSwitcher currentOverride={null} />)
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull()
  })

  it('should_show_reset_button_when_override_is_set', () => {
    render(<DevRoleSwitcher currentOverride="rider" />)
    expect(screen.getByRole('button', { name: /reset/i })).toBeDefined()
  })

  it('should_call_setDevRoleOverride_with_role_and_pathname_when_role_button_clicked', () => {
    render(<DevRoleSwitcher currentOverride={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'trainer' }))
    expect(setDevRoleOverride).toHaveBeenCalledWith('trainer', '/barn/green-acres')
  })

  it('should_call_clearDevRoleOverride_with_pathname_when_reset_clicked', () => {
    render(<DevRoleSwitcher currentOverride="rider" />)
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(clearDevRoleOverride).toHaveBeenCalledWith('/barn/green-acres')
  })
})
