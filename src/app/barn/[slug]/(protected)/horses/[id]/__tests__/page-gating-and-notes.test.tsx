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
const unavailableHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: false, unavailability_reason: 'on stall rest' })
const horseWithNotes = createMockHorse({
  id: 'horse-1',
  name: 'Thunderbolt',
  is_available: true,
  feed_notes: '2 flakes hay AM/PM',
  medication_notes: 'Bute 1g daily',
})
const horseWithRegisteredName = createMockHorse({
  id: 'horse-1',
  name: 'Thunderbolt',
  is_available: true,
  registered_name: 'Four-Leaf Clover',
})

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

  // Status is now a header Badge for every role rather than a manager-less <dl> row — the
  // 'identity header' block in page-layout-sections.test.tsx asserts it per role.

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

  // The labelled "Registered Name" row is gone — it sits unlabelled under the name in the
  // header now, so absence is asserted on the value rather than on a dt that no longer exists.
  it('should_not_render_registered_name_for_trainer_when_null', async () => {
    mockRequireMembershipAs(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('Four-Leaf Clover')).toBeNull()
  })

  it('should_not_render_h1_registered_name_for_manager', async () => {
    vi.mocked(getHorseById).mockResolvedValue(horseWithRegisteredName)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('heading', { name: 'Thunderbolt' })).toBeDefined()
  })
})
