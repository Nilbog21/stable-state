import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockAgreement, createMockAgreementCharge, createMockUser } from '@/test/fixtures'

const mockNotFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
)
vi.mock('next/navigation', () => ({ notFound: mockNotFound, useRouter: vi.fn(() => ({ refresh: vi.fn() })) }))

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/agreements', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/agreements')>('@/lib/db/agreements')
  return { ...actual, getAgreementById: vi.fn(), getChargesForAgreement: vi.fn() }
})
vi.mock('@/lib/db/barn-memberships', () => ({ resolveMemberNames: vi.fn() }))
vi.mock('@/lib/db/horses', () => ({ resolveHorseNames: vi.fn() }))

import { requireMembership } from '@/lib/auth/guard'
import { getAgreementById, getChargesForAgreement } from '@/lib/db/agreements'
import { resolveMemberNames } from '@/lib/db/barn-memberships'
import { resolveHorseNames } from '@/lib/db/horses'
import AgreementDetailPage from '../page'

const mockBarn = createMockBarn()
const mockUser = createMockUser()
const mockManagerMembership = createMockMembership({ role: 'manager' })

function callPage() {
  return AgreementDetailPage({
    params: Promise.resolve({ slug: 'green-acres', id: 'agreement-1' }),
  })
}

describe('AgreementDetailPage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getAgreementById).mockReset()
    vi.mocked(getChargesForAgreement).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(resolveHorseNames).mockReset()
    mockNotFound.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: mockUser as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(getAgreementById).mockResolvedValue(createMockAgreement())
    vi.mocked(getChargesForAgreement).mockResolvedValue([createMockAgreementCharge()])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['rider-1', 'Dana Rider']]))
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Apple']]))
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await callPage()
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_notFound_when_agreement_not_found', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(null)

    await expect(callPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_render_resolved_rider_name', async () => {
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByText('Dana Rider')).toBeDefined()
  })

  it('should_render_resolved_horse_name', async () => {
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByText('Apple')).toBeDefined()
  })

  it('should_render_edit_link', async () => {
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByRole('link', { name: /edit/i })).toHaveProperty(
      'href',
      expect.stringContaining('/barn/green-acres/agreements/agreement-1/edit')
    )
  })

  it('should_include_kind_query_param_in_edit_link_for_lease', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(createMockAgreement({ kind: 'lease' }))
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByRole('link', { name: /edit/i })).toHaveProperty(
      'href',
      expect.stringContaining('?kind=lease')
    )
  })

  it('should_include_kind_query_param_in_edit_link_for_board', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(createMockAgreement({ kind: 'board' }))
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByRole('link', { name: /edit/i })).toHaveProperty(
      'href',
      expect.stringContaining('?kind=board')
    )
  })

  it('should_render_a_charge_row', async () => {
    vi.mocked(getChargesForAgreement).mockResolvedValue([createMockAgreementCharge({ fee: 350 })])
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByDisplayValue('350')).toBeDefined()
  })

  it('should_render_no_charges_message_when_empty', async () => {
    vi.mocked(getChargesForAgreement).mockResolvedValue([])
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByText(/no charges yet/i)).toBeDefined()
  })

  it('should_render_boarding_label_for_board_kind', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(createMockAgreement({ kind: 'board' }))
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByRole('heading', { name: /boarding detail/i })).toBeDefined()
  })

  it('should_render_one_time_cadence_label', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(createMockAgreement({ cadence: 'one_time' }))
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByText('One time')).toBeDefined()
  })

  it('should_render_dash_when_rider_name_not_resolved', async () => {
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const jsx = await callPage()
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_render_dash_when_horse_name_not_resolved', async () => {
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    const jsx = await callPage()
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_render_ended_status_for_inactive_agreement', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(createMockAgreement({ is_active: false }))
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByText('Ended')).toBeDefined()
  })

  it('should_render_active_status_for_monthly_active_agreement', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(
      createMockAgreement({ is_active: true, cadence: 'monthly' })
    )
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByText('Active')).toBeDefined()
  })

  it('should_render_complete_status_for_one_time_active_agreement', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(
      createMockAgreement({ is_active: true, cadence: 'one_time' })
    )
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByText('Complete')).toBeDefined()
  })
})
