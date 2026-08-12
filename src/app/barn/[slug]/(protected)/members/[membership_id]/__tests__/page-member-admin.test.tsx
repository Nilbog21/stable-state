import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
import { revokeInviteTokenAction, removeMemberAction } from '../actions'
import MemberDetailPage from '../page'

const mockBarn = createMockBarn()
const targetProfile = createMockProfile({ id: 'profile-2', user_id: 'user-trn', first_name: 'Bob', last_name: 'Trainer' })

const managerMembership = createMockMembership({ id: 'mem-mgr', user_id: 'user-mgr', role: 'manager' })
const trainerMembership = createMockMembership({ id: 'mem-trn', user_id: 'user-trn', role: 'trainer' })
const riderMembership = createMockMembership({ id: 'mem-rdr', user_id: 'user-rdr', role: 'rider' })

const targetTrainerMembership = createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer' })
const targetRiderMembership = createMockMembership({ id: 'mem-target-rdr', user_id: 'user-target-rdr', barn_id: 'barn-1', role: 'rider' })

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

  describe('Instructor Access section', () => {
    it('should_show_revoke_button_for_manager_viewing_trainer_with_can_instruct_true', async () => {
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
        createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer', can_instruct: true })
      )
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByRole('button', { name: /revoke instructor access/i })).toBeDefined()
    })

    it('should_show_grant_button_for_manager_viewing_trainer_with_can_instruct_false', async () => {
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
        createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer', can_instruct: false })
      )
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByRole('button', { name: /grant instructor access/i })).toBeDefined()
    })

    it('should_show_instructor_access_section_for_manager_viewing_manager_target', async () => {
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
        createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager', can_instruct: false })
      )
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr-target') })
      render(jsx)
      expect(screen.getByRole('heading', { name: /instructor access/i })).toBeDefined()
    })

    it('should_show_instructor_access_section_for_stub_trainer_with_no_user_id', async () => {
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
        createMockMembership({ id: 'mem-stub-trn', user_id: null as any, barn_id: 'barn-1', role: 'trainer', can_instruct: false })
      )
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ first_name: 'Stub', last_name: 'Trainer' }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-stub-trn') })
      render(jsx)
      expect(screen.getByRole('button', { name: /grant instructor access/i })).toBeDefined()
    })

    it('should_not_show_instructor_access_section_for_manager_viewing_rider_target', async () => {
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
      render(jsx)
      expect(screen.queryByRole('heading', { name: /instructor access/i })).toBeNull()
    })

    it('should_not_show_instructor_access_section_for_trainer_viewing_own_page', async () => {
      mockRequireMembershipAs(trainerMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(trainerMembership)
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-trn') })
      render(jsx)
      expect(screen.queryByRole('heading', { name: /instructor access/i })).toBeNull()
    })

    it('should_not_show_instructor_access_section_for_rider_viewing_own_page', async () => {
      mockRequireMembershipAs(riderMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(riderMembership)
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-rdr') })
      render(jsx)
      expect(screen.queryByRole('heading', { name: /instructor access/i })).toBeNull()
    })
  })

  describe('Remove member button', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should_show_remove_button_for_manager_viewing_other_member', async () => {
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByRole('button', { name: /^remove$/i })).toBeDefined()
    })

    it('should_not_show_remove_button_for_manager_viewing_own_page', async () => {
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(managerMembership)
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-mgr', first_name: 'Meg', last_name: 'Manager' }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr') })
      render(jsx)
      expect(screen.queryByRole('button', { name: /^remove$/i })).toBeNull()
    })

    it('should_not_show_remove_button_for_trainer_viewing_other_member', async () => {
      mockRequireMembershipAs(trainerMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
      render(jsx)
      expect(screen.queryByRole('button', { name: /^remove$/i })).toBeNull()
    })

    it('should_not_show_remove_button_for_rider_viewing_other_member', async () => {
      mockRequireMembershipAs(riderMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetTrainerMembership)
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.queryByRole('button', { name: /^remove$/i })).toBeNull()
    })

    it('should_not_show_remove_button_for_manager_viewing_other_manager_target', async () => {
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
        createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })
      )
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-mgr-target', first_name: 'Morgan', last_name: 'Manager' }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr-target') })
      render(jsx)
      expect(screen.queryByRole('button', { name: /^remove$/i })).toBeNull()
    })

    it('should_call_removeMemberAction_when_remove_confirmed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      vi.mocked(removeMemberAction).mockResolvedValue(undefined)
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      fireEvent.click(screen.getByRole('button', { name: /^remove$/i }))
      expect(removeMemberAction).toHaveBeenCalledWith('green-acres', 'mem-target-trn', expect.any(FormData))
    })

    it('should_not_call_removeMemberAction_when_remove_cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      fireEvent.click(screen.getByRole('button', { name: /^remove$/i }))
      expect(removeMemberAction).not.toHaveBeenCalled()
    })
  })

  describe('Manage member section', () => {
    const unclaimedTargetMembership = createMockMembership({
      id: 'mem-target-trn', user_id: null as any, barn_id: 'barn-1', role: 'trainer', invite_token: 'tok-abc',
    })
    const unclaimedTargetProfile = createMockProfile({ id: 'profile-2', first_name: 'Bob', last_name: 'Trainer', is_managed: true })

    it('should_render_manage_member_notice_for_manager_viewing_unclaimed_member', async () => {
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(unclaimedTargetMembership)
      vi.mocked(getProfileById).mockResolvedValue(unclaimedTargetProfile)
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByText(/this is an unlinked member/i)).toBeDefined()
    })

    it('should_hide_manage_member_section_when_target_is_claimed', async () => {
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
        createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer', invite_token: null })
      )
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-2', first_name: 'Bob', last_name: 'Trainer', is_managed: false }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.queryByText(/this is an unlinked member/i)).toBeNull()
    })

    it('should_hide_manage_member_section_when_invite_token_is_null', async () => {
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
        createMockMembership({ id: 'mem-target-trn', user_id: null as any, barn_id: 'barn-1', role: 'trainer', invite_token: null })
      )
      vi.mocked(getProfileById).mockResolvedValue(unclaimedTargetProfile)
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.queryByText(/this is an unlinked member/i)).toBeNull()
    })

    it('should_hide_manage_member_section_for_trainer_viewing_unclaimed_rider', async () => {
      mockRequireMembershipAs(trainerMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
        createMockMembership({ id: 'mem-target-rdr', user_id: null as any, barn_id: 'barn-1', role: 'rider', invite_token: 'tok-rdr' })
      )
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-3', first_name: 'Carol', last_name: 'Rider', is_managed: true }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
      render(jsx)
      expect(screen.queryByText(/this is an unlinked member/i)).toBeNull()
    })

    it('should_render_manage_member_section_immediately_after_header_row', async () => {
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(unclaimedTargetMembership)
      vi.mocked(getProfileById).mockResolvedValue(unclaimedTargetProfile)
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      const heading = screen.getByRole('heading', { name: /bob trainer/i })
      const headerRow = heading.parentElement as HTMLElement
      expect(headerRow.nextElementSibling?.textContent).toMatch(/unlinked member/i)
    })

    it('should_call_revokeInviteTokenAction_when_revoke_form_submits', async () => {
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(unclaimedTargetMembership)
      vi.mocked(getProfileById).mockResolvedValue(unclaimedTargetProfile)
      vi.mocked(revokeInviteTokenAction).mockResolvedValue({ error: null })
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      fireEvent.click(screen.getByRole('button', { name: /^revoke$/i }))
      // The trailing two are useActionState's calling convention, arriving because the bound
      // Server Function now reaches the hook unwrapped (#1396) — same shape as
      // page-documents.test.tsx's deleteDocumentAction assertion.
      expect(revokeInviteTokenAction).toHaveBeenCalledWith('green-acres', 'mem-target-trn', null, expect.any(FormData))
    })
  })
})
