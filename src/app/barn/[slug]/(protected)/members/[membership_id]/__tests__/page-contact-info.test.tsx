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

  describe('Contact Info section', () => {
    it('should_render_phone_for_real_member', async () => {
      vi.mocked(getProfileById).mockResolvedValue(
        createMockProfile({ first_name: 'Bob', last_name: 'Trainer', phone: '555-1234', emergency_contact_name: 'Jane Doe', emergency_contact_phone: '555-5678' })
      )
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByText('555-1234')).toBeDefined()
    })

    it('should_render_emergency_contact_name_for_real_member', async () => {
      vi.mocked(getProfileById).mockResolvedValue(
        createMockProfile({ first_name: 'Bob', last_name: 'Trainer', phone: '555-1234', emergency_contact_name: 'Jane Doe', emergency_contact_phone: '555-5678' })
      )
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByText('Jane Doe')).toBeDefined()
    })

    it('should_render_emergency_contact_phone_for_real_member', async () => {
      vi.mocked(getProfileById).mockResolvedValue(
        createMockProfile({ first_name: 'Bob', last_name: 'Trainer', phone: '555-1234', emergency_contact_name: 'Jane Doe', emergency_contact_phone: '555-5678' })
      )
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByText('555-5678')).toBeDefined()
    })

    it('should_render_heading_when_contact_fields_missing', async () => {
      vi.mocked(getProfileById).mockResolvedValue(
        createMockProfile({ first_name: 'Bob', last_name: 'Trainer', phone: null, emergency_contact_name: null, emergency_contact_phone: null })
      )
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByRole('heading', { name: /contact info/i })).toBeDefined()
    })

    it('should_render_em_dash_for_missing_contact_fields', async () => {
      vi.mocked(getProfileById).mockResolvedValue(
        createMockProfile({ first_name: 'Bob', last_name: 'Trainer', phone: null, emergency_contact_name: null, emergency_contact_phone: null })
      )
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
    })

    it('should_show_contact_info_when_manager_views_any_target', async () => {
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByRole('heading', { name: /contact info/i })).toBeDefined()
    })

    it('should_show_contact_info_when_trainer_views_rider', async () => {
      mockRequireMembershipAs(trainerMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
      render(jsx)
      expect(screen.getByRole('heading', { name: /contact info/i })).toBeDefined()
    })

    it('should_show_contact_info_when_self_viewing_own_page', async () => {
      mockRequireMembershipAs(riderMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(riderMembership)
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-rdr') })
      render(jsx)
      expect(screen.getByRole('heading', { name: /contact info/i })).toBeDefined()
    })

    it('should_show_contact_info_when_rider_views_other_trainer', async () => {
      mockRequireMembershipAs(riderMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetTrainerMembership)
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByRole('heading', { name: /contact info/i })).toBeDefined()
    })

    it('should_show_contact_info_when_rider_views_other_rider', async () => {
      mockRequireMembershipAs(riderMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
      render(jsx)
      expect(screen.getByRole('heading', { name: /contact info/i })).toBeDefined()
    })

    it('should_show_contact_info_when_rider_views_manager', async () => {
      mockRequireMembershipAs(riderMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
        createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })
      )
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr-target') })
      render(jsx)
      expect(screen.getByRole('heading', { name: /contact info/i })).toBeDefined()
    })

    it('should_show_contact_info_when_trainer_views_other_trainer', async () => {
      mockRequireMembershipAs(trainerMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetTrainerMembership)
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByRole('heading', { name: /contact info/i })).toBeDefined()
    })

    it('should_show_contact_info_when_trainer_views_manager', async () => {
      mockRequireMembershipAs(trainerMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
        createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })
      )
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr-target') })
      render(jsx)
      expect(screen.getByRole('heading', { name: /contact info/i })).toBeDefined()
    })

    it('should_show_edit_link_when_self_viewing_own_page', async () => {
      mockRequireMembershipAs(riderMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(riderMembership)
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-rdr') })
      render(jsx)
      const link = screen.getByRole('link', { name: /edit/i })
      expect(link.getAttribute('href')).toBe('/profile?barn=green-acres')
    })

    it('should_not_show_edit_link_when_manager_views_other_target', async () => {
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.queryByRole('link', { name: /edit/i })).toBeNull()
    })
  })

  describe('Contact Info edit form', () => {
    it('should_show_edit_form_when_manager_views_stub_target', async () => {
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
        createMockMembership({ id: 'mem-stub', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
      )
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ first_name: 'Stub', last_name: 'Member', is_managed: true }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-stub') })
      render(jsx)
      expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
    })

    it('should_show_read_only_when_manager_views_real_target', async () => {
      vi.mocked(getProfileById).mockResolvedValue(
        createMockProfile({ first_name: 'Bob', last_name: 'Trainer', is_managed: false })
      )
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
    })

    it('should_show_edit_form_when_manager_views_stub_target_with_linked_account', async () => {
      // defensive: is_managed and null user_id are set together by claim_managed_member, but the
      // form's gating is keyed off is_managed alone, matching the RLS boundary from #526
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ first_name: 'Bob', last_name: 'Trainer', is_managed: true }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
    })

    it('should_show_read_only_when_trainer_views_stub_rider_target', async () => {
      mockRequireMembershipAs(trainerMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
        createMockMembership({ id: 'mem-stub-rdr', user_id: null as any, barn_id: 'barn-1', role: 'rider' })
      )
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ first_name: 'Stub', last_name: 'Rider', is_managed: true }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-stub-rdr') })
      render(jsx)
      expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
    })
  })
})
