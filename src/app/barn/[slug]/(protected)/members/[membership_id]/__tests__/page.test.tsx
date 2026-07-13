import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockProfile, createMockAgreement } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'
import type { TrainerDocument, RiderDocument } from '@/lib/db/types'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getMembershipById: vi.fn(),
}))
vi.mock('@/lib/db/profiles', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/db/documents', () => ({
  getDocuments: vi.fn(),
}))
vi.mock('@/lib/db/document-storage', () => ({
  getSignedUrl: vi.fn(),
}))
vi.mock('@/lib/db/agreements', () => ({
  getActiveAgreementsForRider: vi.fn(),
}))
vi.mock('@/lib/db/horses', () => ({
  resolveHorseNames: vi.fn(),
}))
vi.mock('../actions', () => ({
  uploadDocumentAction: vi.fn(),
  deleteDocumentAction: vi.fn(),
  updateDocumentReminderDateAction: vi.fn(),
  updateContactInfoAction: vi.fn(),
  setCanInstructAction: vi.fn(),
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
  redirect: mockRedirect,
  useRouter: () => ({ refresh: vi.fn() }),
}))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getMembershipById } from '@/lib/db/barn-memberships'
import { getProfileById } from '@/lib/db/profiles'
import { getDocuments } from '@/lib/db/documents'
import { getSignedUrl } from '@/lib/db/document-storage'
import { getActiveAgreementsForRider } from '@/lib/db/agreements'
import { resolveHorseNames } from '@/lib/db/horses'
import { uploadDocumentAction, deleteDocumentAction } from '../actions'
import MemberDetailPage from '../page'

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

describe('MemberDetailPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth({ id: 'user-mgr', email: 'mgr@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(getProfileById).mockResolvedValue(targetProfile)
    vi.mocked(getDocuments).mockResolvedValue([])
    vi.mocked(getSignedUrl).mockResolvedValue('https://example.com/signed')
    vi.mocked(getActiveAgreementsForRider).mockReset()
    vi.mocked(getActiveAgreementsForRider).mockResolvedValue([])
    vi.mocked(resolveHorseNames).mockReset()
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
  })

  it('should_show_not_found_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(MemberDetailPage({ params: makeParams('unknown', 'mem-1') })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_redirect_when_unauthenticated', async () => {
    setupAuth(null)
    await expect(MemberDetailPage({ params: makeParams('green-acres', 'mem-1') })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_unauthenticated_user_to_barn_login', async () => {
    setupAuth(null)
    await MemberDetailPage({ params: makeParams('green-acres', 'mem-1') }).catch(() => {})
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_when_membership_inactive', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ status: 'pending' }))
    await expect(MemberDetailPage({ params: makeParams('green-acres', 'mem-1') })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_inactive_membership_to_barn_login', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ status: 'pending' }))
    await MemberDetailPage({ params: makeParams('green-acres', 'mem-1') }).catch(() => {})
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_show_not_found_when_target_membership_not_found', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(null)
    await expect(MemberDetailPage({ params: makeParams('green-acres', 'mem-gone') })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_show_not_found_when_target_membership_belongs_to_different_barn', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(otherBarnMembership)
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

  it('should_render_upload_document_heading_in_text_sm', async () => {
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByRole('heading', { name: /upload document/i }).className).toContain('text-sm')
  })

  it('should_show_trainer_documents_for_manager_viewing_trainer', async () => {
    vi.mocked(getDocuments).mockResolvedValue([mockTrainerDoc])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByText('contract.pdf')).toBeDefined()
  })

  it('should_show_rider_documents_for_manager_viewing_rider', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
    vi.mocked(getDocuments).mockResolvedValue([mockRiderDoc] as any)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.getByText('waiver.pdf')).toBeDefined()
  })

  it('should_show_own_trainer_documents_for_trainer_viewing_self', async () => {
    setupAuth({ id: 'user-trn', email: 'trn@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getMembershipById).mockResolvedValue(trainerMembership)
    vi.mocked(getDocuments).mockResolvedValue([mockTrainerDoc])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-trn') })
    render(jsx)
    expect(screen.getByText('contract.pdf')).toBeDefined()
  })

  it('should_show_rider_documents_for_trainer_viewing_rider', async () => {
    setupAuth({ id: 'user-trn', email: 'trn@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
    vi.mocked(getDocuments).mockResolvedValue([mockRiderDoc] as any)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.getByText('waiver.pdf')).toBeDefined()
  })

  it('should_show_not_found_when_trainer_views_other_trainer', async () => {
    setupAuth({ id: 'user-trn', email: 'trn@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    await expect(MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_show_not_found_when_trainer_views_manager', async () => {
    setupAuth({ id: 'user-trn', email: 'trn@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })
    )
    await expect(MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr-target') })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_show_own_rider_documents_for_rider_viewing_self', async () => {
    setupAuth({ id: 'user-rdr', email: 'rdr@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
    vi.mocked(getDocuments).mockResolvedValue([mockRiderDoc] as any)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-rdr') })
    render(jsx)
    expect(screen.getByText('waiver.pdf')).toBeDefined()
  })

  it('should_show_not_found_when_rider_views_other_member', async () => {
    setupAuth({ id: 'user-rdr', email: 'rdr@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    await expect(MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_show_upload_form_when_manager_views_trainer', async () => {
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByRole('button', { name: /upload/i })).toBeDefined()
  })

  it('should_not_show_upload_form_when_trainer_views_rider', async () => {
    setupAuth({ id: 'user-trn', email: 'trn@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.queryByRole('button', { name: /upload/i })).toBeNull()
  })

  it('should_show_no_account_message_when_target_has_no_user_id', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
    )
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-nouser') })
    render(jsx)
    expect(screen.getByText(/no account linked/i)).toBeDefined()
  })

  it('should_show_heading_and_name_for_stub_member_with_no_user_id', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
    )
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ first_name: 'Stub', last_name: 'Member' }))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-nouser') })
    render(jsx)
    expect(screen.getByRole('heading', { name: /stub member/i })).toBeDefined()
  })

  it('should_show_contact_info_for_stub_member_with_no_user_id', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
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
    vi.mocked(getDocuments).mockResolvedValue([mockTrainerDoc])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByRole('button', { name: /delete/i })).toBeDefined()
  })

  it('should_not_show_delete_button_when_trainer_views_rider_doc', async () => {
    setupAuth({ id: 'user-trn', email: 'trn@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
    vi.mocked(getDocuments).mockResolvedValue([mockRiderDoc] as any)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('should_show_trainer_documents_for_manager_viewing_manager', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })
    )
    vi.mocked(getDocuments).mockResolvedValue([mockTrainerDoc])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr-target') })
    render(jsx)
    expect(screen.getByText('contract.pdf')).toBeDefined()
  })

  it('should_show_upload_form_when_manager_views_manager_page', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })
    )
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr-target') })
    render(jsx)
    expect(screen.getByRole('button', { name: /upload/i })).toBeDefined()
  })

  it('should_show_delete_button_when_manager_views_manager_doc', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })
    )
    vi.mocked(getDocuments).mockResolvedValue([mockTrainerDoc])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr-target') })
    render(jsx)
    expect(screen.getByRole('button', { name: /delete/i })).toBeDefined()
  })

  it('should_show_upload_form_when_trainer_views_own_page', async () => {
    setupAuth({ id: 'user-trn', email: 'trn@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getMembershipById).mockResolvedValue(trainerMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-trn', first_name: 'Bob', last_name: 'Trainer' }))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-trn') })
    render(jsx)
    expect(screen.getByRole('button', { name: /upload/i })).toBeDefined()
  })

  it('should_show_upload_form_when_rider_views_own_page', async () => {
    setupAuth({ id: 'user-rdr', email: 'rdr@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-rdr') })
    render(jsx)
    expect(screen.getByRole('button', { name: /upload/i })).toBeDefined()
  })

  it('should_show_delete_button_when_rider_views_own_doc', async () => {
    setupAuth({ id: 'user-rdr', email: 'rdr@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
    vi.mocked(getDocuments).mockResolvedValue([mockRiderDoc] as any)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-rdr') })
    render(jsx)
    expect(screen.getByRole('button', { name: /delete/i })).toBeDefined()
  })

  it('should_render_documents_table_when_documents_exist', async () => {
    vi.mocked(getDocuments).mockResolvedValue([mockTrainerDoc])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByRole('table')).toBeDefined()
  })

  it('should_render_type_column_header_when_documents_exist', async () => {
    vi.mocked(getDocuments).mockResolvedValue([mockTrainerDoc])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByText('Type')).toBeDefined()
  })

  it('should_render_notes_em_dash_when_notes_is_null', async () => {
    vi.mocked(getDocuments).mockResolvedValue([mockTrainerDoc])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_render_notes_text_when_present', async () => {
    vi.mocked(getDocuments).mockResolvedValue([{ ...mockTrainerDoc, notes: 'signed 2026' }])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByText('signed 2026')).toBeDefined()
  })

  it('should_render_reminder_due_badge_when_document_reminder_date_is_past', async () => {
    vi.mocked(getDocuments).mockResolvedValue([{ ...mockTrainerDoc, reminder_date: '2020-01-01' }])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByText(/reminder due/i)).toBeDefined()
  })

  it('should_not_render_reminder_due_badge_when_document_has_no_reminder_date', async () => {
    vi.mocked(getDocuments).mockResolvedValue([{ ...mockTrainerDoc, reminder_date: null }])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.queryByText(/reminder due/i)).toBeNull()
  })

  it('should_show_active_agreements_header_and_card_when_active_agreement_exists', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
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
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
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

  it('should_show_no_active_agreements_text_and_no_add_boarding_link_when_empty', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
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
    vi.mocked(getMembershipById).mockResolvedValue(managedRiderMembership)
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-managed-rdr') })
    render(jsx)
    expect(screen.getByText(/no active agreements/i)).toBeDefined()
  })

  it('should_not_render_active_agreements_section_for_trainer_viewing_rider', async () => {
    setupAuth({ id: 'user-trn', email: 'trn@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.queryByText(/active agreements/i)).toBeNull()
  })

  it('should_not_call_getActiveAgreementsForRider_when_trainer_views_rider', async () => {
    setupAuth({ id: 'user-trn', email: 'trn@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
    await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    expect(getActiveAgreementsForRider).not.toHaveBeenCalled()
  })

  it('should_render_active_agreements_section_for_rider_viewing_own_page', async () => {
    setupAuth({ id: 'user-rdr', email: 'rdr@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
    vi.mocked(getActiveAgreementsForRider).mockResolvedValue([
      createMockAgreement({ id: 'agreement-9', fee: 450, kind: 'board', cadence: 'monthly', horse_id: 'horse-1' }),
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Bella']]))
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-rdr') })
    render(jsx)
    expect(screen.getByRole('link', { name: /450/ })).toBeDefined()
  })

  it('should_call_uploadDocumentAction_when_upload_form_submits', async () => {
    vi.mocked(uploadDocumentAction).mockResolvedValue({ error: null })
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    const form = screen.getByRole('button', { name: /upload/i }).closest('form')!
    fireEvent.submit(form)
    expect(uploadDocumentAction).toHaveBeenCalledWith('green-acres', 'mem-target-trn', { error: null }, expect.any(FormData))
  })

  it('should_call_deleteDocumentAction_when_delete_form_submits', async () => {
    vi.mocked(getDocuments).mockResolvedValue([mockTrainerDoc])
    vi.mocked(deleteDocumentAction).mockResolvedValue({ error: null })
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    const form = screen.getByRole('button', { name: /delete/i }).closest('form')!
    fireEvent.submit(form)
    expect(deleteDocumentAction).toHaveBeenCalledWith('green-acres', 'mem-target-trn', 'doc-1', mockTrainerDoc.storage_path)
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
      setupAuth({ id: 'user-trn', email: 'trn@example.com' })
      vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
      vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
      render(jsx)
      expect(screen.getByRole('heading', { name: /contact info/i })).toBeDefined()
    })

    it('should_show_contact_info_when_self_viewing_own_page', async () => {
      setupAuth({ id: 'user-rdr', email: 'rdr@example.com' })
      vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
      vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-rdr') })
      render(jsx)
      expect(screen.getByRole('heading', { name: /contact info/i })).toBeDefined()
    })
  })

  describe('Contact Info edit form', () => {
    it('should_show_edit_form_when_manager_views_stub_target', async () => {
      vi.mocked(getMembershipById).mockResolvedValue(
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
      setupAuth({ id: 'user-trn', email: 'trn@example.com' })
      vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
      vi.mocked(getMembershipById).mockResolvedValue(
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
      vi.mocked(getMembershipById).mockResolvedValue(
        createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer', can_instruct: true })
      )
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByRole('button', { name: /revoke instructor access/i })).toBeDefined()
    })

    it('should_show_grant_button_for_manager_viewing_trainer_with_can_instruct_false', async () => {
      vi.mocked(getMembershipById).mockResolvedValue(
        createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer', can_instruct: false })
      )
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
      render(jsx)
      expect(screen.getByRole('button', { name: /grant instructor access/i })).toBeDefined()
    })

    it('should_show_instructor_access_section_for_manager_viewing_manager_target', async () => {
      vi.mocked(getMembershipById).mockResolvedValue(
        createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager', can_instruct: false })
      )
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr-target') })
      render(jsx)
      expect(screen.getByRole('heading', { name: /instructor access/i })).toBeDefined()
    })

    it('should_show_instructor_access_section_for_stub_trainer_with_no_user_id', async () => {
      vi.mocked(getMembershipById).mockResolvedValue(
        createMockMembership({ id: 'mem-stub-trn', user_id: null as any, barn_id: 'barn-1', role: 'trainer', can_instruct: false })
      )
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ first_name: 'Stub', last_name: 'Trainer' }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-stub-trn') })
      render(jsx)
      expect(screen.getByRole('button', { name: /grant instructor access/i })).toBeDefined()
    })

    it('should_not_show_instructor_access_section_for_manager_viewing_rider_target', async () => {
      vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
      render(jsx)
      expect(screen.queryByRole('heading', { name: /instructor access/i })).toBeNull()
    })

    it('should_not_show_instructor_access_section_for_trainer_viewing_own_page', async () => {
      setupAuth({ id: 'user-trn', email: 'trn@example.com' })
      vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
      vi.mocked(getMembershipById).mockResolvedValue(trainerMembership)
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-trn') })
      render(jsx)
      expect(screen.queryByRole('heading', { name: /instructor access/i })).toBeNull()
    })

    it('should_not_show_instructor_access_section_for_rider_viewing_own_page', async () => {
      setupAuth({ id: 'user-rdr', email: 'rdr@example.com' })
      vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
      vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
      vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
      const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-rdr') })
      render(jsx)
      expect(screen.queryByRole('heading', { name: /instructor access/i })).toBeNull()
    })
  })
})
