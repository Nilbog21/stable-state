import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../actions', () => ({
  createManagedMemberAction: vi.fn(),
  revokeInviteTokenAction: vi.fn(),
}))

import { ManagedMemberRow } from '../ManagedMemberRow'

const defaultProps = {
  name: 'Ghost Member',
  barnSlug: 'green-acres',
  membershipId: 'mem-1',
  inviteToken: 'tok-abc',
}

describe('ManagedMemberRow', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
  })

  it('should_render_member_name', () => {
    render(<ManagedMemberRow {...defaultProps} />)
    expect(screen.getByText('Ghost Member')).toBeDefined()
  })

  it('should_render_unlinked_badge', () => {
    render(<ManagedMemberRow {...defaultProps} />)
    expect(screen.getByText('Unlinked')).toBeDefined()
  })

  it('should_render_copy_invite_button', () => {
    render(<ManagedMemberRow {...defaultProps} />)
    expect(screen.getByRole('button', { name: /copy invite/i })).toBeDefined()
  })

  it('should_render_revoke_button', () => {
    render(<ManagedMemberRow {...defaultProps} />)
    expect(screen.getByRole('button', { name: /revoke/i })).toBeDefined()
  })

  it('should_call_clipboard_with_invite_url_on_copy_click', () => {
    render(<ManagedMemberRow {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /copy invite/i }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/barn/green-acres/login?token=tok-abc')
    )
  })

  it('should_render_for_a_managed_trainer_row', () => {
    render(<ManagedMemberRow {...defaultProps} name="Ghost Trainer" />)
    expect(screen.getByText('Ghost Trainer')).toBeDefined()
  })
})
