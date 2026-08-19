import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockHorse, createMockUser, instant } from '@/test/fixtures'

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
const riderMembership = createMockMembership({ role: 'rider', status: 'active' })

function mockRequireMembershipAs(membership: ReturnType<typeof createMockMembership>) {
  vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership })
}

const availableHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: true, unavailability_reason: null })

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

  // #1390 removed the bar from this page for every role — see the 'accordion sections' block in page-layout-sections.test.tsx.

  it('should_call_get_my_horse_lesson_read_privilege_with_horse_and_barn_id_for_rider', async () => {
    mockRequireMembershipAs(riderMembership)
    await HorseDetailPage({ params: pageParams })
    expect(getMyHorseLessonReadPrivilege).toHaveBeenCalledWith('horse-1', 'barn-1')
  })

  it('should_not_call_get_my_horse_lesson_read_privilege_for_manager', async () => {
    await HorseDetailPage({ params: pageParams })
    expect(getMyHorseLessonReadPrivilege).not.toHaveBeenCalled()
  })

  it('should_render_upcoming_lessons_section_for_manager', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('Upcoming Lessons')).toBeDefined()
  })

  it('should_not_render_upcoming_lessons_section_for_rider_without_lesson_read_privilege', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMyHorseLessonReadPrivilege).mockResolvedValue(false)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('Upcoming Lessons')).toBeNull()
  })

  it('should_render_upcoming_lessons_section_for_rider_with_lesson_read_privilege', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMyHorseLessonReadPrivilege).mockResolvedValue(true)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('Upcoming Lessons')).toBeDefined()
  })

  it('should_render_upcoming_lessons_accordion_as_collapsed_by_default', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    const details = screen.getByText('Upcoming Lessons').closest('details')
    expect(details?.open).toBe(false)
  })

  it('should_render_empty_state_when_no_upcoming_lessons', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('No upcoming lessons')).toBeDefined()
  })

  it('should_render_a_link_to_each_upcoming_lessons_detail_page', async () => {
    vi.mocked(getUpcomingLessonsForHorse).mockResolvedValue([
      { id: 'lesson-1', lessonAt: instant('2026-08-01T10:00:00Z') },
    ])
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    const link = screen.getByRole('link', { name: /2026|aug/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/barn/green-acres/lessons/lesson-1')
  })

  it('should_call_get_upcoming_lessons_for_horse_with_horse_and_barn_id_for_rider', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMyHorseLessonReadPrivilege).mockResolvedValue(true)
    await HorseDetailPage({ params: pageParams })
    expect(getUpcomingLessonsForHorse).toHaveBeenCalledWith('horse-1', 'barn-1', 'America/New_York')
  })

  it('should_not_call_get_upcoming_lessons_for_horse_for_rider_without_lesson_read_privilege', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMyHorseLessonReadPrivilege).mockResolvedValue(false)
    await HorseDetailPage({ params: pageParams })
    expect(getUpcomingLessonsForHorse).not.toHaveBeenCalled()
  })
})
