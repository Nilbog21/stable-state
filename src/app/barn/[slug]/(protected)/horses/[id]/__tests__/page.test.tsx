import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockHorse, createMockUser } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/horses', () => ({ getHorseById: vi.fn() }))
vi.mock('@/lib/db/documents', () => ({
  getDocumentsWithUrls: vi.fn(),
}))
vi.mock('@/lib/db/document-storage', () => ({ getSignedUrl: vi.fn() }))
vi.mock('@/lib/db/member-names', () => ({ resolveMemberNames: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getActiveMembersWithProfiles: vi.fn() }))
vi.mock('@/lib/db/member-horse-privileges', () => ({ getHorsePrivileges: vi.fn() }))
vi.mock('../actions', () => ({
  updateHorseAction: vi.fn(),
  deleteHorseDocumentAction: vi.fn(),
  updateHorseDocumentReminderDateAction: vi.fn(),
  deleteHorsePhotoAction: vi.fn(),
  grantHorseAccessAction: vi.fn(),
  updateHorseAccessDocumentAction: vi.fn(),
  updateHorseAccessLessonAction: vi.fn(),
  revokeHorseAccessAction: vi.fn(),
  setHorseOwnerAction: vi.fn(),
  updateHorseNotesAction: vi.fn(),
}))
vi.mock('../HorseManagerForm', () => ({
  HorseManagerForm: () => <div data-testid="horse-manager-form" />,
}))
vi.mock('../HorseNotesForm', () => ({
  HorseNotesForm: () => <div data-testid="horse-notes-form" />,
}))
vi.mock('../HorseAccessSection', () => ({
  HorseAccessSection: (props: {
    onGrant: (memberId: string) => Promise<void>
    onUpdateDocument: (privilegeId: string, value: 'none' | 'read' | 'write') => Promise<void>
    onUpdateLesson: (privilegeId: string, value: boolean) => Promise<void>
    onRevoke: (privilegeId: string) => Promise<void>
    onSetOwner: (memberId: string | null) => Promise<void>
  }) => (
    <div data-testid="horse-access-section">
      <button onClick={() => props.onGrant('mem-test')}>test-grant</button>
      <button onClick={() => props.onUpdateDocument('privilege-1', 'write')}>test-update-doc</button>
      <button onClick={() => props.onUpdateLesson('privilege-1', true)}>test-update-lesson</button>
      <button onClick={() => props.onRevoke('privilege-1')}>test-revoke</button>
      <button onClick={() => props.onSetOwner('mem-test')}>test-set-owner</button>
    </div>
  ),
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, useRouter: () => ({ refresh: vi.fn() }) }))

import { requireMembership } from '@/lib/auth/guard'
import { getHorseById } from '@/lib/db/horses'
import { getDocumentsWithUrls } from '@/lib/db/documents'
import { getSignedUrl } from '@/lib/db/document-storage'
import { resolveMemberNames } from '@/lib/db/member-names'
import { getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getHorsePrivileges } from '@/lib/db/member-horse-privileges'
import {
  grantHorseAccessAction,
  updateHorseAccessDocumentAction,
  updateHorseAccessLessonAction,
  revokeHorseAccessAction,
  setHorseOwnerAction,
} from '../actions'
import HorseDetailPage from '../page'

const mockBarn = createMockBarn()
const mockUser = createMockUser()
const managerMembership = createMockMembership({ role: 'manager', status: 'active' })
const trainerMembership = createMockMembership({ role: 'trainer', status: 'active' })
const riderMembership = createMockMembership({ role: 'rider', status: 'active' })

function mockRequireMembershipAs(membership: ReturnType<typeof createMockMembership>) {
  vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership })
}

const availableHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: true, unavailability_reason: null })
const unavailableHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: false, unavailability_reason: 'on stall rest' })
const horseWithNotes = createMockHorse({
  id: 'horse-1',
  name: 'Thunderbolt',
  is_available: true,
  feed_notes: '2 flakes hay AM/PM',
  medication_notes: 'Bute 1g daily',
})
const horseWithPhoto = createMockHorse({ id: 'horse-1', name: 'Thunderbolt', photo_path: 'barn-1/horse-photos/horse-1/1.jpg' })
const horseWithRegisteredName = createMockHorse({
  id: 'horse-1',
  name: 'Thunderbolt',
  is_available: true,
  registered_name: 'Four-Leaf Clover',
})
const ownedHorse = createMockHorse({
  id: 'horse-1',
  name: 'Thunderbolt',
  is_available: true,
  owning_member_id: 'mem-owner',
})

const pageParams = Promise.resolve({ slug: 'green-acres', id: 'horse-1' })

const mockDoc = {
  id: 'doc-1',
  barn_id: 'barn-1',
  horse_id: 'horse-1',
  record_type: 'coggins',
  storage_path: 'barn-1/horses/horse-1/coggins.pdf',
  file_name: 'coggins.pdf',
  file_size: 1024,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('HorseDetailPage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    mockRequireMembershipAs(managerMembership)
    vi.mocked(getHorseById).mockResolvedValue(availableHorse)
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([])
    vi.mocked(getSignedUrl).mockReset()
    vi.mocked(getSignedUrl).mockResolvedValue('https://example.com/photo-signed')
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-owner', 'Emery Rider']]))
    vi.mocked(getActiveMembersWithProfiles).mockReset()
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    vi.mocked(getHorsePrivileges).mockReset()
    vi.mocked(getHorsePrivileges).mockResolvedValue([])
  })

  it('should_call_requireMembership_with_allowed_roles', async () => {
    await HorseDetailPage({ params: pageParams })
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager', 'trainer', 'rider'])
  })

  it('should_call_notFound_when_horse_does_not_exist', async () => {
    vi.mocked(getHorseById).mockResolvedValue(null)
    await expect(HorseDetailPage({ params: pageParams })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_render_horse_name', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('heading', { name: 'Thunderbolt' })).toBeDefined()
  })

  it('should_render_available_status_for_trainer_when_horse_is_available', async () => {
    mockRequireMembershipAs(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText(/available/i)).toBeDefined()
  })

  it('should_render_unavailable_status_for_trainer_when_horse_is_unavailable', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue(unavailableHorse)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText(/unavailable/i)).toBeDefined()
  })

  it('should_not_render_status_section_for_manager', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('Status')).toBeNull()
  })

  it('should_render_horse_manager_form_for_manager', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByTestId('horse-manager-form')).toBeDefined()
  })

  it('should_not_render_horse_manager_form_for_trainer', async () => {
    mockRequireMembershipAs(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByTestId('horse-manager-form')).toBeNull()
  })

  it('should_not_render_horse_manager_form_for_rider', async () => {
    mockRequireMembershipAs(riderMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByTestId('horse-manager-form')).toBeNull()
  })

  it('should_render_unavailability_reason_for_trainer_when_unavailable', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue(unavailableHorse)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('on stall rest')).toBeDefined()
  })

  it('should_render_unavailability_reason_for_rider_when_unavailable', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getHorseById).mockResolvedValue(unavailableHorse)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('on stall rest')).toBeDefined()
  })

  it('should_not_render_unavailability_reason_for_trainer_when_available', async () => {
    mockRequireMembershipAs(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('on stall rest')).toBeNull()
  })

  it('should_render_feed_notes_for_trainer_when_set', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue(horseWithNotes)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('2 flakes hay AM/PM')).toBeDefined()
  })

  it('should_render_medication_notes_for_rider_when_set', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getHorseById).mockResolvedValue(horseWithNotes)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('Bute 1g daily')).toBeDefined()
  })

  it('should_not_render_feed_notes_row_for_trainer_when_null', async () => {
    mockRequireMembershipAs(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('Feed Notes')).toBeNull()
  })

  it('should_not_render_medication_notes_row_for_trainer_when_null', async () => {
    mockRequireMembershipAs(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('Medication Notes')).toBeNull()
  })

  it('should_render_feed_notes_for_trainer_when_horse_is_unavailable', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue({ ...horseWithNotes, is_available: false, unavailability_reason: 'on stall rest' })
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('2 flakes hay AM/PM')).toBeDefined()
  })

  it('should_render_horse_notes_form_for_owner_rider', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({ id: 'horse-1', name: 'Thunderbolt', owning_member_id: riderMembership.id }))
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByTestId('horse-notes-form')).toBeDefined()
  })

  it('should_render_horse_notes_form_for_owner_trainer', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({ id: 'horse-1', name: 'Thunderbolt', owning_member_id: trainerMembership.id }))
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByTestId('horse-notes-form')).toBeDefined()
  })

  it('should_not_render_horse_notes_form_for_non_owner_rider', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({ id: 'horse-1', name: 'Thunderbolt', owning_member_id: 'mem-other' }))
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByTestId('horse-notes-form')).toBeNull()
  })

  it('should_not_render_horse_notes_form_for_non_owner_trainer', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({ id: 'horse-1', name: 'Thunderbolt', owning_member_id: 'mem-other' }))
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByTestId('horse-notes-form')).toBeNull()
  })

  it('should_still_render_read_only_feed_notes_for_non_owner_trainer_when_set', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue(horseWithNotes)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('2 flakes hay AM/PM')).toBeDefined()
  })

  it('should_not_render_horse_notes_form_for_non_owner_trainer_when_notes_set', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue(horseWithNotes)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByTestId('horse-notes-form')).toBeNull()
  })

  it('should_render_registered_name_for_trainer_when_set', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue(horseWithRegisteredName)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('Four-Leaf Clover')).toBeDefined()
  })

  it('should_render_registered_name_row_label_for_rider_when_set', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getHorseById).mockResolvedValue(horseWithRegisteredName)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('Registered Name')).toBeDefined()
  })

  it('should_not_render_registered_name_row_for_trainer_when_null', async () => {
    mockRequireMembershipAs(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('Registered Name')).toBeNull()
  })

  it('should_not_render_h1_registered_name_for_manager', async () => {
    vi.mocked(getHorseById).mockResolvedValue(horseWithRegisteredName)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('heading', { name: 'Thunderbolt' })).toBeDefined()
  })

  it('should_render_documents_heading_in_text_sm', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('heading', { name: /^documents$/i }).className).toContain('text-sm')
  })

  it('should_render_add_document_link_for_manager', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    const links = screen.getAllByRole('link', { name: /add document/i }) as HTMLAnchorElement[]
    expect(links[0].href).toMatch(/\/barn\/green-acres\/documents\/new\?entity=horse&id=horse-1$/)
  })

  it('should_render_add_document_link_for_trainer', async () => {
    mockRequireMembershipAs(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getAllByRole('link', { name: /add document/i }).length).toBeGreaterThan(0)
  })

  it('should_not_render_add_document_link_for_rider', async () => {
    mockRequireMembershipAs(riderMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByRole('link', { name: /add document/i })).toBeNull()
  })

  it('should_render_documents_list_for_manager_when_documents_exist', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockDoc, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('coggins.pdf')).toBeDefined()
  })

  it('should_render_no_documents_message_when_list_is_empty_for_manager', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('No documents yet')).toBeDefined()
  })

  it('should_render_delete_button_for_manager_when_document_exists', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockDoc, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('button', { name: /delete/i })).toBeDefined()
  })

  it('should_not_render_delete_button_for_trainer_when_document_exists', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockDoc, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('should_not_render_actions_column_header_for_trainer_when_document_exists', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockDoc, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('Actions')).toBeNull()
  })

  it('should_not_render_documents_section_for_rider', async () => {
    mockRequireMembershipAs(riderMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('No documents yet')).toBeNull()
  })

  it('should_render_documents_table_for_manager_when_documents_exist', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockDoc, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('table')).toBeDefined()
  })

  it('should_render_type_column_header_when_documents_exist', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockDoc, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('Type')).toBeDefined()
  })

  it('should_render_notes_em_dash_when_notes_is_null', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockDoc, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_render_notes_text_when_present', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: { ...mockDoc, notes: 'check annually' }, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('check annually')).toBeDefined()
  })

  it('should_render_reminder_due_badge_when_document_reminder_date_is_past', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: { ...mockDoc, reminder_date: '2020-01-01' }, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText(/reminder due/i)).toBeDefined()
  })

  it('should_not_render_reminder_due_badge_when_document_has_no_reminder_date', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: { ...mockDoc, reminder_date: null }, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText(/reminder due/i)).toBeNull()
  })

  it('should_render_photo_via_signed_url_when_present', async () => {
    vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    const img = screen.getByRole('img', { name: 'Thunderbolt' }) as HTMLImageElement
    expect(img.src).toBe('https://example.com/photo-signed')
  })

  it('should_render_photo_at_fixed_height', async () => {
    vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    const img = screen.getByRole('img', { name: 'Thunderbolt' }) as HTMLImageElement
    expect(img.className).toContain('h-48')
  })

  it('should_render_photo_with_auto_width', async () => {
    vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    const img = screen.getByRole('img', { name: 'Thunderbolt' }) as HTMLImageElement
    expect(img.className).toContain('w-auto')
  })

  it('should_not_crop_photo_to_a_square', async () => {
    vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    const img = screen.getByRole('img', { name: 'Thunderbolt' }) as HTMLImageElement
    expect(img.className).not.toContain('object-cover')
  })

  it('should_fetch_signed_url_for_the_horses_photo_path', async () => {
    vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
    await HorseDetailPage({ params: pageParams })
    expect(getSignedUrl).toHaveBeenCalledWith('barn-1/horse-photos/horse-1/1.jpg')
  })

  it('should_render_photo_for_trainer_when_present', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('img', { name: 'Thunderbolt' })).toBeDefined()
  })

  it('should_render_photo_for_rider_when_present', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('img', { name: 'Thunderbolt' })).toBeDefined()
  })

  it('should_render_replace_photo_control_for_manager_when_photo_present', async () => {
    vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('Replace Photo')).toBeDefined()
  })

  it('should_link_replace_photo_control_to_the_reused_upload_page', async () => {
    vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('link', { name: 'Replace Photo' }).getAttribute('href')).toBe(
      '/barn/green-acres/documents/new?entity=horse&id=horse-1&type=photo'
    )
  })

  it('should_render_remove_control_for_manager_when_photo_present', async () => {
    vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('button', { name: /remove/i })).toBeDefined()
  })

  it('should_not_render_replace_control_for_manager_when_photo_locked_to_owner', async () => {
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({
      id: 'horse-1',
      name: 'Thunderbolt',
      photo_path: 'barn-1/horse-photos/horse-1/1.jpg',
      owning_member_id: 'mem-owner-x',
      photo_uploaded_by: 'mem-owner-x',
    }))
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('Replace Photo')).toBeNull()
  })

  it('should_not_render_remove_control_for_manager_when_photo_locked_to_owner', async () => {
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({
      id: 'horse-1',
      name: 'Thunderbolt',
      photo_path: 'barn-1/horse-photos/horse-1/1.jpg',
      owning_member_id: 'mem-owner-x',
      photo_uploaded_by: 'mem-owner-x',
    }))
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })

  it('should_render_replace_control_for_manager_when_horse_has_owner_but_photo_is_unlocked', async () => {
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({
      id: 'horse-1',
      name: 'Thunderbolt',
      photo_path: 'barn-1/horse-photos/horse-1/1.jpg',
      owning_member_id: 'mem-owner-x',
      photo_uploaded_by: null,
    }))
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('Replace Photo')).toBeDefined()
  })

  it('should_render_set_photo_cta_for_manager_when_horse_has_owner_but_no_photo_yet', async () => {
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({
      id: 'horse-1',
      name: 'Thunderbolt',
      owning_member_id: 'mem-owner-x',
    }))
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('Set Photo')).toBeDefined()
  })

  it('should_not_render_replace_control_for_trainer_when_photo_present', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('Replace Photo')).toBeNull()
  })

  it('should_not_render_remove_control_for_trainer_when_photo_present', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })

  it('should_not_fetch_signed_url_when_photo_path_is_absent', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(getSignedUrl).not.toHaveBeenCalled()
  })

  it('should_render_set_photo_cta_for_manager_when_photo_absent', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('Set Photo')).toBeDefined()
  })

  it('should_link_set_photo_cta_to_the_reused_upload_page', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('link', { name: 'Set Photo' }).getAttribute('href')).toBe(
      '/barn/green-acres/documents/new?entity=horse&id=horse-1&type=photo'
    )
  })

  it('should_render_no_photo_text_when_photo_absent', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText(/no photo yet/i)).toBeDefined()
  })

  it('should_not_render_set_photo_cta_for_trainer_when_photo_absent', async () => {
    mockRequireMembershipAs(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('Set Photo')).toBeNull()
  })

  it('should_not_render_set_photo_cta_for_rider_when_photo_absent', async () => {
    mockRequireMembershipAs(riderMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('Set Photo')).toBeNull()
  })

  it('should_render_set_photo_cta_for_owner_rider_when_photo_absent', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({ id: 'horse-1', name: 'Thunderbolt', owning_member_id: riderMembership.id }))
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('Set Photo')).toBeDefined()
  })

  it('should_render_replace_control_for_owner_rider_when_photo_present', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({ id: 'horse-1', name: 'Thunderbolt', photo_path: 'barn-1/horse-photos/horse-1/1.jpg', owning_member_id: riderMembership.id }))
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('Replace Photo')).toBeDefined()
  })

  it('should_render_remove_control_for_owner_rider_when_photo_present', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({ id: 'horse-1', name: 'Thunderbolt', photo_path: 'barn-1/horse-photos/horse-1/1.jpg', owning_member_id: riderMembership.id }))
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('button', { name: /remove/i })).toBeDefined()
  })

  it('should_not_render_set_photo_cta_for_non_owner_rider_when_photo_absent', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({ id: 'horse-1', name: 'Thunderbolt', owning_member_id: 'mem-other' }))
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('Set Photo')).toBeNull()
  })

  it('should_render_owner_name_for_manager_when_set', async () => {
    vi.mocked(getHorseById).mockResolvedValue(ownedHorse)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText(/emery rider/i)).toBeDefined()
  })

  it('should_render_owner_name_for_trainer_when_set', async () => {
    mockRequireMembershipAs(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue(ownedHorse)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText(/emery rider/i)).toBeDefined()
  })

  it('should_render_owner_name_for_rider_when_set', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getHorseById).mockResolvedValue(ownedHorse)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText(/emery rider/i)).toBeDefined()
  })

  it('should_link_owner_name_to_the_members_detail_page', async () => {
    vi.mocked(getHorseById).mockResolvedValue(ownedHorse)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('link', { name: /emery rider/i }).getAttribute('href')).toBe(
      '/barn/green-acres/members/mem-owner'
    )
  })

  it('should_not_render_owner_line_when_owner_is_unset', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText(/^owner/i)).toBeNull()
  })

  it('should_not_call_resolveMemberNames_when_owner_is_unset', async () => {
    await HorseDetailPage({ params: pageParams })
    expect(resolveMemberNames).not.toHaveBeenCalled()
  })

  it('should_not_render_owner_line_when_owner_name_fails_to_resolve', async () => {
    vi.mocked(getHorseById).mockResolvedValue(ownedHorse)
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText(/^owner/i)).toBeNull()
  })

  it('should_render_access_section_for_manager', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByTestId('horse-access-section')).toBeDefined()
  })

  it('should_not_render_access_section_for_trainer', async () => {
    mockRequireMembershipAs(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByTestId('horse-access-section')).toBeNull()
  })

  it('should_not_render_access_section_for_rider', async () => {
    mockRequireMembershipAs(riderMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByTestId('horse-access-section')).toBeNull()
  })

  it('should_fetch_horse_privileges_for_manager', async () => {
    await HorseDetailPage({ params: pageParams })
    expect(getHorsePrivileges).toHaveBeenCalledWith('horse-1', mockBarn.id)
  })

  it('should_not_fetch_horse_privileges_for_trainer', async () => {
    mockRequireMembershipAs(trainerMembership)
    await HorseDetailPage({ params: pageParams })
    expect(getHorsePrivileges).not.toHaveBeenCalled()
  })

  it('should_fetch_active_manager_members_for_manager', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'mem-x', userId: 'user-x', name: 'Xavier Manager', isManaged: false, inviteToken: null },
    ])
    await HorseDetailPage({ params: pageParams })
    expect(getActiveMembersWithProfiles).toHaveBeenCalledWith(mockBarn.id, 'manager')
  })

  it('should_fetch_active_trainer_members_for_manager', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'mem-x', userId: 'user-x', name: 'Xavier Manager', isManaged: false, inviteToken: null },
    ])
    await HorseDetailPage({ params: pageParams })
    expect(getActiveMembersWithProfiles).toHaveBeenCalledWith(mockBarn.id, 'trainer')
  })

  it('should_fetch_active_rider_members_for_manager', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'mem-x', userId: 'user-x', name: 'Xavier Manager', isManaged: false, inviteToken: null },
    ])
    await HorseDetailPage({ params: pageParams })
    expect(getActiveMembersWithProfiles).toHaveBeenCalledWith(mockBarn.id, 'rider')
  })

  it('should_build_grants_falling_back_to_member_id_when_name_is_unresolved', async () => {
    vi.mocked(getHorsePrivileges).mockResolvedValue([
      { id: 'privilege-1', barn_id: 'barn-1', member_id: 'mem-a', horse_id: 'horse-1', document_privileges: 'read', lesson_read_privileges: true, created_at: '' },
      { id: 'privilege-2', barn_id: 'barn-1', member_id: 'mem-unresolved', horse_id: 'horse-1', document_privileges: 'none', lesson_read_privileges: false, created_at: '' },
    ])
    vi.mocked(resolveMemberNames).mockImplementation(async (ids: string[]) => {
      if (ids.includes('mem-a')) return new Map([['mem-a', 'Ada Rider']])
      return new Map([['mem-owner', 'Emery Rider']])
    })
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByTestId('horse-access-section')).toBeDefined()
  })

  it('should_wire_grant_action_with_barn_slug_and_horse_id', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    fireEvent.click(screen.getByText('test-grant'))
    expect(grantHorseAccessAction).toHaveBeenCalledWith('green-acres', 'horse-1', 'mem-test')
  })

  it('should_wire_update_document_action_with_barn_slug_and_horse_id', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    fireEvent.click(screen.getByText('test-update-doc'))
    expect(updateHorseAccessDocumentAction).toHaveBeenCalledWith('green-acres', 'horse-1', 'privilege-1', 'write')
  })

  it('should_wire_update_lesson_action_with_barn_slug_and_horse_id', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    fireEvent.click(screen.getByText('test-update-lesson'))
    expect(updateHorseAccessLessonAction).toHaveBeenCalledWith('green-acres', 'horse-1', 'privilege-1', true)
  })

  it('should_wire_revoke_action_with_barn_slug_and_horse_id', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    fireEvent.click(screen.getByText('test-revoke'))
    expect(revokeHorseAccessAction).toHaveBeenCalledWith('green-acres', 'horse-1', 'privilege-1')
  })

  it('should_wire_set_owner_action_with_barn_slug_and_horse_id', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    fireEvent.click(screen.getByText('test-set-owner'))
    expect(setHorseOwnerAction).toHaveBeenCalledWith('green-acres', 'horse-1', 'mem-test')
  })
})
