import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockProfile, createMockUser } from '@/test/fixtures'
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
import { deleteDocumentAction } from '../actions'
import MemberDetailPage from '../page'
import { calendarDate } from '@/lib/local-day'

const mockBarn = createMockBarn()
const targetProfile = createMockProfile({ id: 'profile-2', user_id: 'user-trn', first_name: 'Bob', last_name: 'Trainer' })

const managerMembership = createMockMembership({ id: 'mem-mgr', user_id: 'user-mgr', role: 'manager' })
const trainerMembership = createMockMembership({ id: 'mem-trn', user_id: 'user-trn', role: 'trainer' })
const riderMembership = createMockMembership({ id: 'mem-rdr', user_id: 'user-rdr', role: 'rider' })

const targetTrainerMembership = createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer' })
const targetRiderMembership = createMockMembership({ id: 'mem-target-rdr', user_id: 'user-target-rdr', barn_id: 'barn-1', role: 'rider' })

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
})
