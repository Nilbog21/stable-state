import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockHorse, createMockUser } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/horses', () => ({
  getHorseById: vi.fn(),
  getHorseProjectedExhaustion: vi.fn(),
  resolveExhaustionThresholds: vi.fn(),
  getUpcomingLessonsForHorse: vi.fn(),
}))
vi.mock('@/lib/db/documents', () => ({
  getDocumentsWithUrls: vi.fn(),
}))
vi.mock('@/lib/db/document-storage', () => ({ getSignedUrl: vi.fn() }))
vi.mock('@/lib/db/member-names', () => ({ resolveMemberNames: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getActiveMembersWithProfiles: vi.fn() }))
vi.mock('@/lib/db/member-horse-privileges', () => ({
  getHorsePrivileges: vi.fn(),
  getMyHorseDocumentPrivilege: vi.fn(),
  getMyHorseLessonReadPrivilege: vi.fn(),
}))
vi.mock('@/components/ExhaustionBar', () => ({
  ExhaustionBar: ({ existingRows }: { existingRows: unknown[] }) => (
    <div data-testid="exhaustion-bar" data-row-count={existingRows.length} />
  ),
}))
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
// The prop shapes mirror the real component's (#1390): onGrant/onUpdateDocument take the
// submitted FormData, since their value comes from a <select> and can't be bound at render.
vi.mock('../HorseAccessSection', () => ({
  HorseAccessSection: (props: {
    grants: { id: string; name: string }[]
    onGrant: (formData: FormData) => Promise<void>
    onUpdateDocument: (privilegeId: string, formData: FormData) => Promise<void>
    onUpdateLesson: (privilegeId: string, value: boolean) => Promise<void>
    onRevoke: (privilegeId: string) => Promise<void>
    onSetOwner: (memberId: string | null) => Promise<void>
  }) => (
    <div data-testid="horse-access-section">
      <ol data-testid="grant-names">
        {props.grants.map((g) => (
          <li key={g.id} data-grant-id={g.id}>{g.name}</li>
        ))}
      </ol>
      <button onClick={() => props.onGrant(new FormData())}>test-grant</button>
      <button onClick={() => props.onUpdateDocument('privilege-1', new FormData())}>test-update-doc</button>
      <button onClick={() => props.onUpdateLesson('privilege-1', true)}>test-update-lesson</button>
      <button onClick={() => props.onRevoke('privilege-1')}>test-revoke</button>
      <button onClick={() => props.onSetOwner('mem-test')}>test-set-owner</button>
    </div>
  ),
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, useRouter: () => ({ refresh: vi.fn() }) }))

import { requireMembership } from '@/lib/auth/guard'
import { getHorseById, getHorseProjectedExhaustion, resolveExhaustionThresholds, getUpcomingLessonsForHorse } from '@/lib/db/horses'
import { getDocumentsWithUrls } from '@/lib/db/documents'
import { getSignedUrl } from '@/lib/db/document-storage'
import { resolveMemberNames } from '@/lib/db/member-names'
import { getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getHorsePrivileges, getMyHorseDocumentPrivilege, getMyHorseLessonReadPrivilege } from '@/lib/db/member-horse-privileges'
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
const horseWithPhoto = createMockHorse({ id: 'horse-1', name: 'Thunderbolt', photo_path: 'barn-1/horse-photos/horse-1/1.jpg' })

const pageParams = Promise.resolve({ slug: 'green-acres', id: 'horse-1' })

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
    vi.mocked(getMyHorseDocumentPrivilege).mockReset()
    vi.mocked(getMyHorseDocumentPrivilege).mockResolvedValue('none')
    vi.mocked(getMyHorseLessonReadPrivilege).mockReset()
    vi.mocked(getMyHorseLessonReadPrivilege).mockResolvedValue(false)
    vi.mocked(getHorseProjectedExhaustion).mockReset()
    vi.mocked(getHorseProjectedExhaustion).mockResolvedValue([])
    vi.mocked(resolveExhaustionThresholds).mockReset()
    vi.mocked(resolveExhaustionThresholds).mockReturnValue({ high: 11, moderate: 5 })
    vi.mocked(getUpcomingLessonsForHorse).mockReset()
    vi.mocked(getUpcomingLessonsForHorse).mockResolvedValue([])
  })

  it('should_render_photo_via_signed_url_when_present', async () => {
    vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    const img = screen.getByRole('img', { name: 'Thunderbolt' }) as HTMLImageElement
    expect(img.src).toBe('https://example.com/photo-signed')
  })

  // Fixed height is asserted in page-layout-sections.test.tsx's 'identity header' block, where the h-32 figure lives.

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

  // The header shows a placeholder icon at the photo's own footprint rather than the taller
  // centred EmptyState block the flat layout used.
  it('should_render_a_placeholder_icon_when_photo_absent', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(document.querySelector('header svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('should_not_render_a_placeholder_icon_when_photo_present', async () => {
    vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(document.querySelector('header svg[aria-hidden="true"]')).toBeNull()
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
})
