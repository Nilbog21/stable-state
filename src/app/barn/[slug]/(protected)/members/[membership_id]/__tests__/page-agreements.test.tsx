import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockProfile, createMockAgreement, createMockUser } from '@/test/fixtures'

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

  it('should_show_active_agreements_header_and_card_when_active_agreement_exists', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
    vi.mocked(getActiveAgreementsForRider).mockResolvedValue([
      createMockAgreement({ id: 'agreement-9', fee: 450, kind: 'board', cadence: 'monthly', horse_id: 'horse-1' }),
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Bella']]))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.getByRole('heading', { name: /active agreements/i })).toBeDefined()
    const link = screen.getByRole('link', { name: /450/ }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/agreements/agreement-9')
    expect(link.textContent).toContain('Bella')
  })

  it('should_carry_the_agreement_kind_as_a_query_on_the_card_href', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
    vi.mocked(getActiveAgreementsForRider).mockResolvedValue([
      createMockAgreement({ id: 'agreement-9', fee: 450, kind: 'board', cadence: 'monthly', horse_id: 'horse-1' }),
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Bella']]))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    const link = screen.getByRole('link', { name: /450/ }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/agreements/agreement-9?kind=board')
  })

  it('should_show_a_card_per_agreement_for_multiple_simultaneously_active_agreements', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
    vi.mocked(getActiveAgreementsForRider).mockResolvedValue([
      createMockAgreement({ id: 'agreement-9', fee: 450, kind: 'board', cadence: 'monthly', horse_id: 'horse-1' }),
      createMockAgreement({ id: 'agreement-10', fee: 300, kind: 'board', cadence: 'monthly', horse_id: 'horse-2' }),
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Bella'], ['horse-2', 'Rocket']]))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.getByRole('link', { name: /450/ })).toBeDefined()
    expect(screen.getByRole('link', { name: /300/ })).toBeDefined()
  })

  it('should_fall_back_to_em_dash_when_horse_name_unresolved', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
    vi.mocked(getActiveAgreementsForRider).mockResolvedValue([
      createMockAgreement({ id: 'agreement-9', fee: 450, kind: 'board', cadence: 'monthly', horse_id: 'horse-1' }),
    ])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    const link = screen.getByRole('link', { name: /450/ })
    expect(link.textContent).toContain('—')
  })

  it('should_not_append_slash_month_for_one_time_cadence', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
    vi.mocked(getActiveAgreementsForRider).mockResolvedValue([
      createMockAgreement({ id: 'agreement-9', fee: 450, kind: 'lease', cadence: 'one_time', horse_id: 'horse-1' }),
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Bella']]))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    const link = screen.getByRole('link', { name: /450/ })
    expect(link.textContent).not.toContain('/month')
  })

  it('should_show_no_active_agreements_text_and_no_add_boarding_link_when_empty', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.getByText(/no active agreements/i)).toBeDefined()
    expect(screen.queryByRole('link', { name: /add boarding/i })).toBeNull()
  })

  it('should_not_render_active_agreements_section_for_trainer_target', async () => {
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.queryByText(/active agreements/i)).toBeNull()
  })

  it('should_not_call_getActiveAgreementsForRider_for_non_rider_targets', async () => {
    await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    expect(getActiveAgreementsForRider).not.toHaveBeenCalled()
  })

  it('should_render_active_agreements_section_for_managed_rider_with_no_user_id', async () => {
    const managedRiderMembership = createMockMembership({ id: 'mem-managed-rdr', user_id: null as any, barn_id: 'barn-1', role: 'rider' })
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(managedRiderMembership)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-managed-rdr') })
    render(jsx)
    expect(screen.getByText(/no active agreements/i)).toBeDefined()
  })

  it('should_not_render_active_agreements_section_for_trainer_viewing_rider', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.queryByText(/active agreements/i)).toBeNull()
  })

  it('should_not_call_getActiveAgreementsForRider_when_trainer_views_rider', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
    await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    expect(getActiveAgreementsForRider).not.toHaveBeenCalled()
  })

  it('should_render_active_agreements_section_for_rider_viewing_own_page', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
    vi.mocked(getActiveAgreementsForRider).mockResolvedValue([
      createMockAgreement({ id: 'agreement-9', fee: 450, kind: 'board', cadence: 'monthly', horse_id: 'horse-1' }),
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Bella']]))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-rdr') })
    render(jsx)
    expect(screen.getByText(/450/)).toBeDefined()
  })

  it('should_not_render_agreement_cards_as_links_for_rider_viewing_own_page', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
    vi.mocked(getActiveAgreementsForRider).mockResolvedValue([
      createMockAgreement({ id: 'agreement-9', fee: 450, kind: 'board', cadence: 'monthly', horse_id: 'horse-1' }),
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Bella']]))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-rdr') })
    render(jsx)
    expect(screen.queryByRole('link', { name: /450/ })).toBeNull()
  })
})
