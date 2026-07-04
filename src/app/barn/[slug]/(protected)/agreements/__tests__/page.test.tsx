import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockAgreement, createMockUser } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/agreements', () => ({ getAgreementsByBarn: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ resolveMemberNames: vi.fn() }))
vi.mock('@/lib/db/horses', () => ({ resolveHorseNames: vi.fn() }))

import { requireMembership } from '@/lib/auth/guard'
import { getAgreementsByBarn } from '@/lib/db/agreements'
import { resolveMemberNames } from '@/lib/db/barn-memberships'
import { resolveHorseNames } from '@/lib/db/horses'
import AgreementsPage from '../page'

const mockBarn = createMockBarn()
const mockUser = createMockUser()
const mockManagerMembership = createMockMembership({ role: 'manager' })

function callPage(kind?: string) {
  return AgreementsPage({
    params: Promise.resolve({ slug: 'green-acres' }),
    searchParams: Promise.resolve(kind === undefined ? {} : { kind }),
  })
}

describe('AgreementsPage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getAgreementsByBarn).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(resolveHorseNames).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: mockUser as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(getAgreementsByBarn).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await callPage('lease')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_default_to_lease_kind_when_kind_param_missing', async () => {
    await callPage(undefined)
    expect(getAgreementsByBarn).toHaveBeenCalledWith(mockBarn.id, 'lease')
  })

  it('should_default_to_lease_kind_when_kind_param_invalid', async () => {
    await callPage('bogus')
    expect(getAgreementsByBarn).toHaveBeenCalledWith(mockBarn.id, 'lease')
  })

  it('should_use_board_kind_when_kind_param_is_board', async () => {
    await callPage('board')
    expect(getAgreementsByBarn).toHaveBeenCalledWith(mockBarn.id, 'board')
  })

  it('should_call_getAgreementsByBarn_with_resolved_kind', async () => {
    await callPage('lease')
    expect(getAgreementsByBarn).toHaveBeenCalledWith(mockBarn.id, 'lease')
  })

  it('should_render_add_lease_button_for_lease_kind', async () => {
    const jsx = await callPage('lease')
    render(jsx)
    expect(screen.getByRole('link', { name: /add lease/i })).toBeDefined()
  })

  it('should_render_add_boarding_button_for_board_kind', async () => {
    const jsx = await callPage('board')
    render(jsx)
    expect(screen.getByRole('link', { name: /add boarding/i })).toBeDefined()
  })

  it('should_render_empty_state_when_no_agreements', async () => {
    const jsx = await callPage('lease')
    render(jsx)
    expect(screen.getByText(/no leases yet/i)).toBeDefined()
  })

  it('should_render_rider_name_in_table_row', async () => {
    vi.mocked(getAgreementsByBarn).mockResolvedValue([createMockAgreement()])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['rider-1', 'Dana Rider']]))
    const jsx = await callPage('lease')
    render(jsx)
    expect(screen.getByText('Dana Rider')).toBeDefined()
  })

  it('should_render_horse_name_in_table_row', async () => {
    vi.mocked(getAgreementsByBarn).mockResolvedValue([createMockAgreement()])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Apple']]))
    const jsx = await callPage('lease')
    render(jsx)
    expect(screen.getByText('Apple')).toBeDefined()
  })

  it('should_render_fee_in_table_row', async () => {
    vi.mocked(getAgreementsByBarn).mockResolvedValue([createMockAgreement({ fee: 200 })])
    const jsx = await callPage('lease')
    render(jsx)
    expect(screen.getByText('$200.00')).toBeDefined()
  })

  it('should_render_active_status_for_active_agreement', async () => {
    vi.mocked(getAgreementsByBarn).mockResolvedValue([createMockAgreement({ is_active: true })])
    const jsx = await callPage('lease')
    render(jsx)
    expect(screen.getByText('Active')).toBeDefined()
  })

  it('should_render_ended_status_for_inactive_agreement', async () => {
    vi.mocked(getAgreementsByBarn).mockResolvedValue([createMockAgreement({ is_active: false })])
    const jsx = await callPage('lease')
    render(jsx)
    expect(screen.getByText('Ended')).toBeDefined()
  })

  it('should_render_edit_link_to_agreement_edit_page', async () => {
    vi.mocked(getAgreementsByBarn).mockResolvedValue([createMockAgreement({ id: 'agreement-9' })])
    const jsx = await callPage('lease')
    render(jsx)
    const link = screen.getByRole('link', { name: /edit/i })
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/agreements/agreement-9/edit')
  })

  it('should_render_view_link_to_agreement_detail_page', async () => {
    vi.mocked(getAgreementsByBarn).mockResolvedValue([createMockAgreement({ id: 'agreement-9' })])
    const jsx = await callPage('lease')
    render(jsx)
    const link = screen.getByRole('link', { name: /view/i })
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/agreements/agreement-9')
    expect((link as HTMLAnchorElement).href).not.toContain('/edit')
  })
})
