import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockAgreement, createMockUser } from '@/test/fixtures'

const mockNotFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
)
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/agreements', () => ({ getAgreementById: vi.fn() }))
vi.mock('@/lib/db/member-names', () => ({ resolveMemberNames: vi.fn() }))
vi.mock('@/lib/db/horses', () => ({ resolveHorseNames: vi.fn() }))

import { requireMembership } from '@/lib/auth/guard'
import { getAgreementById } from '@/lib/db/agreements'
import { resolveMemberNames } from '@/lib/db/member-names'
import { resolveHorseNames } from '@/lib/db/horses'
import EditAgreementPage from '../page'

const mockBarn = createMockBarn()
const mockUser = createMockUser()
const mockManagerMembership = createMockMembership({ role: 'manager' })

function callPage() {
  return EditAgreementPage({
    params: Promise.resolve({ slug: 'green-acres', id: 'agreement-1' }),
  })
}

describe('EditAgreementPage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getAgreementById).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(resolveHorseNames).mockReset()
    mockNotFound.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: mockUser as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(getAgreementById).mockResolvedValue(createMockAgreement())
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

  it('should_render_edit_lease_heading_for_lease_kind', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(createMockAgreement({ kind: 'lease' }))
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByRole('heading', { name: /edit lease/i })).toBeDefined()
  })

  it('should_render_edit_boarding_heading_for_board_kind', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(createMockAgreement({ kind: 'board' }))
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByRole('heading', { name: /edit boarding/i })).toBeDefined()
  })

  it('should_render_resolved_rider_name_as_read_only_text', async () => {
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByText('Dana Rider')).toBeDefined()
  })

  it('should_render_resolved_horse_name_as_read_only_text', async () => {
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByText('Apple')).toBeDefined()
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

  it('should_render_end_agreement_button_when_agreement_is_active', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(createMockAgreement({ is_active: true }))
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByRole('button', { name: /end agreement/i })).toBeDefined()
  })

  it('should_not_render_end_agreement_button_when_agreement_is_already_ended', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(createMockAgreement({ is_active: false }))
    const jsx = await callPage()
    render(jsx)
    expect(screen.queryByRole('button', { name: /end agreement/i })).toBeNull()
  })
})
