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

  // #1224 -- pinned to an instant where the barn's day (America/New_York, the createMockBarn
  // default) and the server host's UTC day disagree: 03:00Z on the 2nd is still the 1st in New
  // York. The pre-fill follows the barn.
  it('should_prefill_start_date_with_the_barns_day_not_the_server_hosts_utc_day', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-03-02T03:00:00Z'))
    try {
      const jsx = await callPage('lease')
      const { container } = render(jsx)
      expect((container.querySelector('input[name="start_date"]') as HTMLInputElement).value).toBe('2026-03-01')
    } finally {
      vi.useRealTimers()
    }
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
