import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockProfile, createMockUser } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getMembershipByIdForBarn: vi.fn(),
}))
vi.mock('@/lib/db/profiles', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/db/documents', () => ({
  getDocumentsWithUrls: vi.fn(),
}))
vi.mock('@/lib/db/agreements', () => ({
  getActiveAgreementsForRider: vi.fn(),
}))
vi.mock('@/lib/db/horses', () => ({
  resolveHorseNames: vi.fn(),
}))
vi.mock('@/lib/db/document-storage', () => ({ getSignedUrl: vi.fn() }))
vi.mock('../actions', () => ({
  deleteDocumentAction: vi.fn(),
  updateDocumentReminderDateAction: vi.fn(),
  updateContactInfoAction: vi.fn(),
  setCanInstructAction: vi.fn(),
  revokeInviteTokenAction: vi.fn(),
  removeMemberAction: vi.fn(),
  deleteProfilePhotoAction: vi.fn(),
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
  useRouter: () => ({ refresh: vi.fn() }),
}))

import { requireMembership } from '@/lib/auth/guard'
import { getMembershipByIdForBarn } from '@/lib/db/barn-memberships'
import { getProfileById } from '@/lib/db/profiles'
import { getDocumentsWithUrls } from '@/lib/db/documents'
import { getActiveAgreementsForRider } from '@/lib/db/agreements'
import { resolveHorseNames } from '@/lib/db/horses'
import { getSignedUrl } from '@/lib/db/document-storage'
import MemberDetailPage from '../page'

const mockBarn = createMockBarn()
const targetProfile = createMockProfile({ id: 'profile-2', user_id: 'user-trn', first_name: 'Bob', last_name: 'Trainer' })

const managerMembership = createMockMembership({ id: 'mem-mgr', user_id: 'user-mgr', role: 'manager' })

const targetTrainerMembership = createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer' })
const otherBarnMembership = createMockMembership({ id: 'mem-other', user_id: 'user-other', barn_id: 'barn-other', role: 'trainer' })

function makeParams(slug: string, membership_id: string) {
  return Promise.resolve({ slug, membership_id })
}

function mockRequireMembershipAs(membership: ReturnType<typeof createMockMembership>) {
  vi.mocked(requireMembership).mockResolvedValue({
    user: createMockUser({ id: membership.user_id }) as any,
    barn: mockBarn,
    membership,
  })
}

describe('MemberDetailPage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    mockRequireMembershipAs(managerMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetTrainerMembership)
    vi.mocked(getProfileById).mockResolvedValue(targetProfile)
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([])
    vi.mocked(getActiveAgreementsForRider).mockReset()
    vi.mocked(getActiveAgreementsForRider).mockResolvedValue([])
    vi.mocked(resolveHorseNames).mockReset()
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(getSignedUrl).mockReset()
    vi.mocked(getSignedUrl).mockResolvedValue('https://example.com/photo-signed')
  })

  it('should_call_requireMembership_with_allowed_roles', async () => {
    await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager', 'trainer', 'rider'])
  })

  it('should_show_not_found_when_target_membership_not_found', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(null)
    await expect(MemberDetailPage({ params: makeParams('green-acres', 'mem-gone') })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_show_not_found_when_target_membership_belongs_to_different_barn', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(otherBarnMembership)
    await expect(MemberDetailPage({ params: makeParams('green-acres', 'mem-other') })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_show_target_member_name_in_heading', async () => {
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByRole('heading', { name: /bob trainer/i })).toBeDefined()
  })

  it('should_fetch_profile_by_target_profile_id', async () => {
    await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    expect(getProfileById).toHaveBeenCalledWith(targetTrainerMembership.profile_id)
  })

  it('should_show_heading_and_name_for_stub_member_with_no_user_id', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
      createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
    )
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ first_name: 'Stub', last_name: 'Member' }))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-nouser') })
    render(jsx)
    expect(screen.getByRole('heading', { name: /stub member/i })).toBeDefined()
  })

  it('should_show_contact_info_for_stub_member_with_no_user_id', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
      createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
    )
    vi.mocked(getProfileById).mockResolvedValue(
      createMockProfile({ first_name: 'Stub', last_name: 'Member', phone: '555-0100' })
    )
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-nouser') })
    render(jsx)
    expect(screen.getByText('555-0100')).toBeDefined()
  })

  it('should_show_membership_id_as_name_when_profile_not_found', async () => {
    vi.mocked(getProfileById).mockResolvedValue(null)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByRole('heading', { name: /mem-target-trn/i })).toBeDefined()
  })
})
