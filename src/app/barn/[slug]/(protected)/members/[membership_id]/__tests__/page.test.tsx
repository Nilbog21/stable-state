import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockProfile, createMockAgreement, createMockUser } from '@/test/fixtures'
import type { TrainerDocument, RiderDocument } from '@/lib/db/types'

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
import { deleteDocumentAction, revokeInviteTokenAction, removeMemberAction } from '../actions'
import MemberDetailPage from '../page'
import { calendarDate } from '@/lib/local-day'

const mockBarn = createMockBarn()
const targetProfile = createMockProfile({ id: 'profile-2', user_id: 'user-trn', first_name: 'Bob', last_name: 'Trainer' })

const managerMembership = createMockMembership({ id: 'mem-mgr', user_id: 'user-mgr', role: 'manager' })
const trainerMembership = createMockMembership({ id: 'mem-trn', user_id: 'user-trn', role: 'trainer' })
const riderMembership = createMockMembership({ id: 'mem-rdr', user_id: 'user-rdr', role: 'rider' })

const targetTrainerMembership = createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer' })
const targetRiderMembership = createMockMembership({ id: 'mem-target-rdr', user_id: 'user-target-rdr', barn_id: 'barn-1', role: 'rider' })
const otherBarnMembership = createMockMembership({ id: 'mem-other', user_id: 'user-other', barn_id: 'barn-other', role: 'trainer' })

const mockTrainerDoc: TrainerDocument = {
  id: 'doc-1', barn_id: 'barn-1', trainer_id: 'user-target-trn',
  record_type: 'instructor_contract', storage_path: 'barn-1/trainers/user-target-trn/contract.pdf',
  file_name: 'contract.pdf', file_size: 1024, notes: null, reminder_date: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

const mockRiderDoc: RiderDocument = {
  id: 'doc-2', barn_id: 'barn-1', rider_id: 'user-target-rdr',
  record_type: 'liability_waiver', storage_path: 'barn-1/riders/user-target-rdr/waiver.pdf',
  file_name: 'waiver.pdf', file_size: 512, notes: null, reminder_date: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

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

  it('should_render_documents_heading_in_text_sm', async () => {
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByRole('heading', { name: /^documents$/i }).className).toContain('text-sm')
  })

  it('should_show_trainer_documents_for_manager_viewing_trainer', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockTrainerDoc, signedUrl: 'https://example.com/signed' }])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByText('contract.pdf')).toBeDefined()
  })

  it('should_show_rider_documents_for_manager_viewing_rider', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockRiderDoc, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.getByText('waiver.pdf')).toBeDefined()
  })

  it('should_show_own_trainer_documents_for_trainer_viewing_self', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(trainerMembership)
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockTrainerDoc, signedUrl: 'https://example.com/signed' }])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-trn') })
    render(jsx)
    expect(screen.getByText('contract.pdf')).toBeDefined()
  })

  it('should_not_render_rider_document_when_trainer_views_rider', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockRiderDoc, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.queryByText('waiver.pdf')).toBeNull()
  })

  it('should_not_render_documents_heading_when_trainer_views_rider', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockRiderDoc, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.queryByRole('heading', { name: /^documents$/i })).toBeNull()
  })

  it('should_render_name_heading_when_trainer_views_other_trainer', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetTrainerMembership)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByRole('heading', { name: /bob trainer/i })).toBeDefined()
  })

  it('should_not_render_documents_heading_when_trainer_views_other_trainer', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetTrainerMembership)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.queryByRole('heading', { name: /^documents$/i })).toBeNull()
  })

  it('should_render_page_without_documents_when_trainer_views_manager', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
      createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })
    )
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr-target') })
    render(jsx)
    expect(screen.queryByRole('heading', { name: /^documents$/i })).toBeNull()
  })

  it('should_show_own_rider_documents_for_rider_viewing_self', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockRiderDoc, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-rdr') })
    render(jsx)
    expect(screen.getByText('waiver.pdf')).toBeDefined()
  })

  it('should_render_name_heading_when_rider_views_other_member', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetTrainerMembership)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByRole('heading', { name: /bob trainer/i })).toBeDefined()
  })

  it('should_render_page_when_rider_views_trainer_membership', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetTrainerMembership)
    await expect(
      MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    ).resolves.toBeDefined()
  })

  it('should_hide_documents_section_when_rider_views_other_member', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetTrainerMembership)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.queryByRole('heading', { name: /^documents$/i })).toBeNull()
  })

  it('should_hide_documents_heading_when_non_manager_non_self_views_stub_member', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
      createMockMembership({ id: 'mem-stub-rdr', user_id: null as any, barn_id: 'barn-1', role: 'rider' })
    )
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ first_name: 'Stub', last_name: 'Rider' }))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-stub-rdr') })
    render(jsx)
    expect(screen.queryByRole('heading', { name: /^documents$/i })).toBeNull()
  })

  it('should_show_add_document_link_when_manager_views_trainer', async () => {
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getAllByRole('link', { name: /add document/i }).length).toBeGreaterThan(0)
  })

  it('should_not_show_add_document_link_when_trainer_views_rider', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.queryByRole('link', { name: /add document/i })).toBeNull()
  })

  it('should_show_documents_heading_when_manager_views_stub_member_with_no_user_id', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
      createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
    )
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-nouser') })
    render(jsx)
    expect(screen.getByRole('heading', { name: /^documents$/i })).toBeDefined()
  })

  it('should_show_add_document_link_when_manager_views_stub_member_with_no_user_id', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
      createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
    )
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-nouser') })
    render(jsx)
    expect(screen.getByRole('link', { name: /add document/i })).toBeDefined()
  })

  it('should_fetch_documents_using_membership_id_for_stub_member_with_no_user_id', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
      createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
    )
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-nouser') })
    render(jsx)
    expect(getDocumentsWithUrls).toHaveBeenCalledWith('trainer', 'mem-nouser', 'barn-1')
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

  it('should_show_delete_button_next_to_document_when_can_upload', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockTrainerDoc, signedUrl: 'https://example.com/signed' }])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByRole('button', { name: /delete/i })).toBeDefined()
  })

  it('should_show_trainer_documents_for_manager_viewing_manager', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
      createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })
    )
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockTrainerDoc, signedUrl: 'https://example.com/signed' }])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr-target') })
    render(jsx)
    expect(screen.getByText('contract.pdf')).toBeDefined()
  })

  it('should_show_upload_form_when_manager_views_manager_page', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
      createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })
    )
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr-target') })
    render(jsx)
    expect(screen.getAllByRole('link', { name: /add document/i }).length).toBeGreaterThan(0)
  })

  it('should_show_delete_button_when_manager_views_manager_doc', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(
      createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })
    )
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockTrainerDoc, signedUrl: 'https://example.com/signed' }])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr-target') })
    render(jsx)
    expect(screen.getByRole('button', { name: /delete/i })).toBeDefined()
  })

  it('should_show_add_document_link_when_trainer_views_own_page', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(trainerMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-trn', first_name: 'Bob', last_name: 'Trainer' }))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-trn') })
    render(jsx)
    expect(screen.getAllByRole('link', { name: /add document/i }).length).toBeGreaterThan(0)
  })

  it('should_not_show_add_document_link_when_rider_views_own_page', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-rdr') })
    render(jsx)
    expect(screen.queryByRole('link', { name: /add document/i })).toBeNull()
  })

  it('should_not_show_delete_button_when_rider_views_own_doc', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockRiderDoc, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-rdr') })
    render(jsx)
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('should_render_documents_table_when_documents_exist', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockTrainerDoc, signedUrl: 'https://example.com/signed' }])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByRole('table')).toBeDefined()
  })

  it('should_render_type_column_header_when_documents_exist', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockTrainerDoc, signedUrl: 'https://example.com/signed' }])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByText('Type')).toBeDefined()
  })

  it('should_render_notes_em_dash_when_notes_is_null', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockTrainerDoc, signedUrl: 'https://example.com/signed' }])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_render_notes_text_when_present', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: { ...mockTrainerDoc, notes: 'signed 2026' }, signedUrl: 'https://example.com/signed' }])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByText('signed 2026')).toBeDefined()
  })

  it('should_render_reminder_due_badge_when_document_reminder_date_is_past', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: { ...mockTrainerDoc, reminder_date: calendarDate('2020-01-01') }, signedUrl: 'https://example.com/signed' }])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByText(/reminder due/i)).toBeDefined()
  })

  it('should_not_render_reminder_due_badge_when_document_has_no_reminder_date', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: { ...mockTrainerDoc, reminder_date: null }, signedUrl: 'https://example.com/signed' }])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.queryByText(/reminder due/i)).toBeNull()
  })

  // #1149 -- the badge's cutoff is the barn's own day, not the viewer's. At this instant a Pacific
  // barn is still on Mar 1 while the pinned Eastern viewer's device already reads Mar 2.
  it('should_not_render_reminder_due_badge_when_the_reminder_is_still_future_in_barn_time', async () => {
    const originalTz = process.env.TZ
    process.env.TZ = 'America/New_York'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-02T06:00:00Z'))
    vi.mocked(requireMembership).mockResolvedValue({
      user: createMockUser({ id: managerMembership.user_id }) as any,
      barn: { ...mockBarn, timezone: 'America/Los_Angeles' },
      membership: managerMembership,
    })
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: { ...mockTrainerDoc, reminder_date: calendarDate('2026-03-02') }, signedUrl: 'https://example.com/signed' }])

    try {
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.queryByText(/reminder due/i)).toBeNull()
    } finally {
      vi.useRealTimers()
      process.env.TZ = originalTz
    }
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

  it('should_render_add_document_link_for_trainer_target', async () => {
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    const links = screen.getAllByRole('link', { name: /add document/i }) as HTMLAnchorElement[]
    expect(links[0].href).toMatch(/\/barn\/green-acres\/documents\/new\?entity=trainer&id=mem-target-trn$/)
  })

  it('should_render_add_document_link_for_rider_target', async () => {
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    const links = screen.getAllByRole('link', { name: /add document/i }) as HTMLAnchorElement[]
    expect(links[0].href).toMatch(/\/barn\/green-acres\/documents\/new\?entity=rider&id=mem-target-rdr$/)
  })

  it('should_not_render_add_document_link_when_caller_cannot_upload', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.queryByRole('link', { name: /add document/i })).toBeNull()
  })

  it('should_call_deleteDocumentAction_when_delete_form_submits', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockTrainerDoc, signedUrl: 'https://example.com/signed' }])
    vi.mocked(deleteDocumentAction).mockResolvedValue({ error: null })
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    const form = screen.getByRole('button', { name: /delete/i }).closest('form')!
    fireEvent.submit(form)
    expect(deleteDocumentAction).toHaveBeenCalledWith('green-acres', 'mem-target-trn', 'doc-1', mockTrainerDoc.storage_path, { error: null }, expect.any(FormData))
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
      // Server Function now reaches the hook unwrapped (#1396) — same shape as the
      // deleteDocumentAction assertion above.
      expect(revokeInviteTokenAction).toHaveBeenCalledWith('green-acres', 'mem-target-trn', null, expect.any(FormData))
    })
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
