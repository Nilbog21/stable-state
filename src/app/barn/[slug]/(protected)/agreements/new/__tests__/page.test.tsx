import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockHorse, createMockUser } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getActiveMembersWithProfiles: vi.fn() }))
vi.mock('@/lib/db/horses', () => ({ getHorsesByBarn: vi.fn() }))
vi.mock('@/lib/db/agreements', () => ({ getBarnDefaultBoardFee: vi.fn() }))

import { requireMembership } from '@/lib/auth/guard'
import { getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getBarnDefaultBoardFee } from '@/lib/db/agreements'
import NewAgreementPage from '../page'

const mockBarn = createMockBarn()
const mockUser = createMockUser()
const mockManagerMembership = createMockMembership({ role: 'manager' })

function callPage(kind?: string) {
  return NewAgreementPage({
    params: Promise.resolve({ slug: 'green-acres' }),
    searchParams: Promise.resolve(kind === undefined ? {} : { kind }),
  })
}

describe('NewAgreementPage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getActiveMembersWithProfiles).mockReset()
    vi.mocked(getHorsesByBarn).mockReset()
    vi.mocked(getBarnDefaultBoardFee).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: mockUser as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'rider-1', userId: 'user-1', name: 'Dana Rider', isManaged: false, inviteToken: null },
    ])
    vi.mocked(getHorsesByBarn).mockResolvedValue([createMockHorse()])
    vi.mocked(getBarnDefaultBoardFee).mockResolvedValue(1000)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await callPage('lease')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_default_to_lease_kind_when_kind_param_missing', async () => {
    const jsx = await callPage(undefined)
    render(jsx)
    expect(screen.getByRole('heading', { name: /add lease/i })).toBeDefined()
  })

  it('should_call_getBarnDefaultBoardFee_only_when_kind_is_board', async () => {
    await callPage('board')
    expect(getBarnDefaultBoardFee).toHaveBeenCalledWith(mockBarn.id)
  })

  it('should_not_call_getBarnDefaultBoardFee_when_kind_is_lease', async () => {
    await callPage('lease')
    expect(getBarnDefaultBoardFee).not.toHaveBeenCalled()
  })

  it('should_render_add_lease_heading_for_lease_kind', async () => {
    const jsx = await callPage('lease')
    render(jsx)
    expect(screen.getByRole('heading', { name: /add lease/i })).toBeDefined()
  })

  it('should_render_add_boarding_heading_for_board_kind', async () => {
    const jsx = await callPage('board')
    render(jsx)
    expect(screen.getByRole('heading', { name: /add boarding/i })).toBeDefined()
  })

  it('should_pass_riders_mapped_from_membershipId_and_name', async () => {
    const jsx = await callPage('lease')
    render(jsx)
    expect(screen.getByRole('option', { name: 'Dana Rider' })).toBeDefined()
  })
})
