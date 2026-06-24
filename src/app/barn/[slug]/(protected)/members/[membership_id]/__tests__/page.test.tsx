import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockProfile } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'
import type { TrainerDocument, RiderDocument } from '@/lib/db/types'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getMembershipById: vi.fn(),
}))
vi.mock('@/lib/db/profiles', () => ({ getProfileByUserId: vi.fn() }))
vi.mock('@/lib/db/trainer-documents', () => ({
  getTrainerDocuments: vi.fn(),
  getDocumentSignedUrl: vi.fn(),
}))
vi.mock('@/lib/db/rider-documents', () => ({
  getRiderDocuments: vi.fn(),
  getDocumentSignedUrl: vi.fn(),
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getMembershipById } from '@/lib/db/barn-memberships'
import { getProfileByUserId } from '@/lib/db/profiles'
import { getTrainerDocuments, getDocumentSignedUrl as getTrainerSignedUrl } from '@/lib/db/trainer-documents'
import { getRiderDocuments, getDocumentSignedUrl as getRiderSignedUrl } from '@/lib/db/rider-documents'
import MemberDetailPage from '../page'

const mockBarn = createMockBarn()
const callerProfile = createMockProfile({ user_id: 'user-mgr', first_name: 'Alice', last_name: 'Manager' })
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
  file_name: 'contract.pdf', file_size: 1024, notes: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

const mockRiderDoc: RiderDocument = {
  id: 'doc-2', barn_id: 'barn-1', rider_id: 'user-target-rdr',
  record_type: 'liability_waiver', storage_path: 'barn-1/riders/user-target-rdr/waiver.pdf',
  file_name: 'waiver.pdf', file_size: 512, notes: null,
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
    vi.mocked(getProfileByUserId).mockImplementation(async (uid) =>
      uid === 'user-mgr' ? callerProfile : targetProfile
    )
    vi.mocked(getTrainerDocuments).mockResolvedValue([])
    vi.mocked(getRiderDocuments).mockResolvedValue([])
    vi.mocked(getTrainerSignedUrl).mockResolvedValue('https://example.com/signed')
    vi.mocked(getRiderSignedUrl).mockResolvedValue('https://example.com/signed')
  })

  it('should_show_not_found_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(MemberDetailPage({ params: makeParams('unknown', 'mem-1') })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_redirect_when_unauthenticated', async () => {
    setupAuth(null)
    await expect(MemberDetailPage({ params: makeParams('green-acres', 'mem-1') })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_when_membership_inactive', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ status: 'pending' }))
    await expect(MemberDetailPage({ params: makeParams('green-acres', 'mem-1') })).rejects.toThrow('NEXT_REDIRECT')
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

  it('should_show_trainer_documents_for_manager_viewing_trainer', async () => {
    vi.mocked(getTrainerDocuments).mockResolvedValue([mockTrainerDoc])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByText('contract.pdf')).toBeDefined()
  })

  it('should_show_rider_documents_for_manager_viewing_rider', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileByUserId).mockImplementation(async (uid) =>
      uid === 'user-mgr' ? callerProfile : createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' })
    )
    vi.mocked(getRiderDocuments).mockResolvedValue([mockRiderDoc])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.getByText('waiver.pdf')).toBeDefined()
  })

  it('should_show_own_trainer_documents_for_trainer_viewing_self', async () => {
    setupAuth({ id: 'user-trn', email: 'trn@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getMembershipById).mockResolvedValue(trainerMembership)
    vi.mocked(getTrainerDocuments).mockResolvedValue([mockTrainerDoc])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-trn') })
    render(jsx)
    expect(screen.getByText('contract.pdf')).toBeDefined()
  })

  it('should_show_rider_documents_for_trainer_viewing_rider', async () => {
    setupAuth({ id: 'user-trn', email: 'trn@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileByUserId).mockImplementation(async (uid) =>
      uid === 'user-trn' ? createMockProfile({ user_id: 'user-trn', first_name: 'Bob', last_name: 'Trainer' })
        : createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' })
    )
    vi.mocked(getRiderDocuments).mockResolvedValue([mockRiderDoc])
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

  it('should_show_own_rider_documents_for_rider_viewing_self', async () => {
    setupAuth({ id: 'user-rdr', email: 'rdr@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfileByUserId).mockResolvedValue(createMockProfile({ user_id: 'user-rdr', first_name: 'Dave', last_name: 'Rider' }))
    vi.mocked(getRiderDocuments).mockResolvedValue([mockRiderDoc])
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
    vi.mocked(getProfileByUserId).mockImplementation(async (uid) =>
      uid === 'user-trn' ? createMockProfile({ user_id: 'user-trn', first_name: 'Bob', last_name: 'Trainer' })
        : createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' })
    )
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

  it('should_not_show_heading_when_target_has_no_user_id', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
    )
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-nouser') })
    render(jsx)
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('should_show_user_id_as_name_when_profile_not_found', async () => {
    vi.mocked(getProfileByUserId).mockImplementation(async (uid) =>
      uid === 'user-mgr' ? callerProfile : null
    )
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByRole('heading', { name: /user-target-trn/i })).toBeDefined()
  })

  it('should_show_delete_button_next_to_document_when_can_upload', async () => {
    vi.mocked(getTrainerDocuments).mockResolvedValue([mockTrainerDoc])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-trn') })
    render(jsx)
    expect(screen.getByRole('button', { name: /delete/i })).toBeDefined()
  })

  it('should_not_show_delete_button_when_trainer_views_rider_doc', async () => {
    setupAuth({ id: 'user-trn', email: 'trn@example.com' })
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileByUserId).mockImplementation(async (uid) =>
      uid === 'user-trn' ? createMockProfile({ user_id: 'user-trn', first_name: 'Bob', last_name: 'Trainer' })
        : createMockProfile({ user_id: 'user-target-rdr', first_name: 'Carol', last_name: 'Rider' })
    )
    vi.mocked(getRiderDocuments).mockResolvedValue([mockRiderDoc])
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-target-rdr') })
    render(jsx)
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('should_show_no_documents_available_when_target_is_manager', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })
    )
    const jsx = await MemberDetailPage({ params: makeParams('green-acres', 'mem-mgr-target') })
    render(jsx)
    expect(screen.getByText(/no documents available/i)).toBeDefined()
  })
})
