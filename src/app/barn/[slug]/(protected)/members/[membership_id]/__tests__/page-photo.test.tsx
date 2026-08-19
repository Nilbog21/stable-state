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

const targetTrainerMembership = createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer' })

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

  describe('Photo section', () => {
    const profileWithPhoto = createMockProfile({
      id: 'profile-2', user_id: 'user-target-trn', first_name: 'Bob', last_name: 'Trainer',
      is_managed: false, photo_path: 'barn-1/profile-photos/profile-2/1.jpg',
    })
    const managedProfileWithPhoto = createMockProfile({
      id: 'profile-2', user_id: null, first_name: 'Bob', last_name: 'Trainer',
      is_managed: true, photo_path: 'barn-1/profile-photos/profile-2/1.jpg',
    })

    it('should_render_photo_via_signed_url_when_present', async () => {
      vi.mocked(getProfileById).mockResolvedValue(profileWithPhoto)
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      const img = screen.getByRole('img', { name: 'Bob Trainer' }) as HTMLImageElement
      expect(img.src).toBe('https://example.com/photo-signed')
    })

    it('should_fetch_signed_url_for_the_profiles_photo_path', async () => {
      vi.mocked(getProfileById).mockResolvedValue(profileWithPhoto)
      await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      expect(getSignedUrl).toHaveBeenCalledWith('barn-1/profile-photos/profile-2/1.jpg')
    })

    it('should_not_fetch_signed_url_when_photo_path_is_absent', async () => {
      await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      expect(getSignedUrl).not.toHaveBeenCalled()
    })

    it('should_render_empty_state_when_no_photo', async () => {
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByText('No photo yet')).toBeDefined()
    })

    it('should_render_set_photo_link_for_manager_when_target_is_managed', async () => {
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-2', is_managed: true }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByRole('link', { name: 'Set Photo' }).getAttribute('href')).toBe(
        '/barn/green-acres/documents/new?entity=profile&id=mem-target-trn&type=photo'
      )
    })

    it('should_not_render_set_photo_link_for_manager_when_target_is_not_managed', async () => {
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-2', is_managed: false }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.queryByText('Set Photo')).toBeNull()
    })

    it('should_render_replace_and_remove_controls_for_self_when_photo_present', async () => {
      mockRequireMembershipAs(trainerMembership)
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(trainerMembership)
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({
        id: 'profile-own', user_id: 'user-trn', is_managed: false,
        photo_path: 'barn-1/profile-photos/profile-own/1.jpg',
      }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-trn') })
      render(jsx)
      expect(screen.getByText('Replace Photo')).toBeDefined()
      expect(screen.getByRole('button', { name: /remove/i })).toBeDefined()
    })

    it('should_not_render_set_photo_link_when_trainer_views_another_unmanaged_member', async () => {
      mockRequireMembershipAs(trainerMembership)
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-2', is_managed: false }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.queryByText('Set Photo')).toBeNull()
    })

    it('should_render_set_photo_link_for_manager_when_target_is_managed_and_unclaimed', async () => {
      vi.mocked(getProfileById).mockResolvedValue(managedProfileWithPhoto)
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByText('Replace Photo')).toBeDefined()
    })
  })
})
