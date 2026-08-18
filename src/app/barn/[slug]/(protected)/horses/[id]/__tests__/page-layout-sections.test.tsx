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

  // #1390 — the page is now an always-visible identity header plus a role-filtered list of
  // AccordionSections, the same shape for every role. These assert the parts of that shape the
  // per-feature blocks above don't already cover.
  describe('identity header', () => {
    const ROLES = [
      ['manager', managerMembership],
      ['trainer', trainerMembership],
      ['rider', riderMembership],
    ] as const

    for (const [roleName, membership] of ROLES) {
      it(`should_render_the_status_badge_in_the_header_for_${roleName}`, async () => {
        mockRequireMembershipAs(membership)
        render(await HorseDetailPage({ params: pageParams }))
        expect(screen.getByText('Active')).toBeDefined()
      })

      it(`should_render_the_registered_name_in_the_header_for_${roleName}`, async () => {
        mockRequireMembershipAs(membership)
        vi.mocked(getHorseById).mockResolvedValue(horseWithRegisteredName)
        render(await HorseDetailPage({ params: pageParams }))
        expect(screen.getByText('Four-Leaf Clover')).toBeDefined()
      })

      it(`should_render_the_unavailability_reason_in_the_header_for_${roleName}`, async () => {
        mockRequireMembershipAs(membership)
        vi.mocked(getHorseById).mockResolvedValue(unavailableHorse)
        render(await HorseDetailPage({ params: pageParams }))
        expect(screen.getByText('on stall rest')).toBeDefined()
      })

      it(`should_render_the_owner_link_in_the_header_for_${roleName}`, async () => {
        mockRequireMembershipAs(membership)
        vi.mocked(getHorseById).mockResolvedValue(ownedHorse)
        render(await HorseDetailPage({ params: pageParams }))
        expect(screen.getByRole('link', { name: 'Emery Rider' }).getAttribute('href'))
          .toBe('/barn/green-acres/members/mem-owner')
      })
    }

    it('should_render_the_unavailable_status_badge', async () => {
      vi.mocked(getHorseById).mockResolvedValue(unavailableHorse)
      render(await HorseDetailPage({ params: pageParams }))
      expect(screen.getByText('Unavailable')).toBeDefined()
    })

    it('should_render_the_inactive_status_badge', async () => {
      vi.mocked(getHorseById).mockResolvedValue(
        createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_active: false, is_available: false })
      )
      render(await HorseDetailPage({ params: pageParams }))
      expect(screen.getByText('Inactive')).toBeDefined()
    })

    /**
     * #1549 removed the "No owner set" fallback with the state it described: `owning_member_id` is
     * NOT NULL, so there is no unset owner for the line to report. What survives is the *resolution*
     * failure — a membership always points at a profile, but that profile row can be missing or
     * unreadable — and there the header renders nothing rather than a blank link.
     */
    it('should_not_render_an_owner_line_when_the_owner_name_fails_to_resolve', async () => {
      vi.mocked(getHorseById).mockResolvedValue(ownedHorse)
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      render(await HorseDetailPage({ params: pageParams }))
      expect(screen.queryByRole('link', { name: /emery rider/i })).toBeNull()
    })

    it('should_never_render_no_owner_set', async () => {
      render(await HorseDetailPage({ params: pageParams }))
      expect(screen.queryByText('No owner set')).toBeNull()
    })

    it('should_render_the_photo_at_header_height', async () => {
      vi.mocked(getHorseById).mockResolvedValue(horseWithPhoto)
      render(await HorseDetailPage({ params: pageParams }))
      expect(screen.getByRole('img', { name: 'Thunderbolt' }).className).toContain('h-32')
    })
  })

  describe('accordion sections', () => {
    // #1390 removed the bar from this page entirely -- it is the horses list's signal, and
    // this page's Upcoming Lessons section carries the same schedule in a readable form.
    const ROLES = [
      ['manager', managerMembership, false],
      ['trainer', trainerMembership, false],
      ['rider', riderMembership, true],
    ] as const

    for (const [roleName, membership, privileged] of ROLES) {
      it(`should_not_render_an_exhaustion_bar_for_${roleName}`, async () => {
        mockRequireMembershipAs(membership)
        vi.mocked(getMyHorseLessonReadPrivilege).mockResolvedValue(privileged)
        render(await HorseDetailPage({ params: pageParams }))
        expect(screen.queryByTestId('exhaustion-bar')).toBeNull()
      })
    }

    it('should_not_fetch_projected_exhaustion', async () => {
      await HorseDetailPage({ params: pageParams })
      expect(getHorseProjectedExhaustion).not.toHaveBeenCalled()
    })

    it('should_not_resolve_exhaustion_thresholds', async () => {
      await HorseDetailPage({ params: pageParams })
      expect(resolveExhaustionThresholds).not.toHaveBeenCalled()
    })

    it('should_render_feed_and_medication_open_by_default', async () => {
      render(await HorseDetailPage({ params: pageParams }))
      const details = screen.getByRole('heading', { name: 'Feed & Medication' }).closest('details')
      expect(details?.open).toBe(true)
    })

    it('should_render_every_other_section_collapsed', async () => {
      render(await HorseDetailPage({ params: pageParams }))
      const collapsed = ['Upcoming Lessons', 'Documents', 'Access', 'Horse Settings']
        .map((name) => screen.getByRole('heading', { name }).closest('details')?.open)
      expect(collapsed).toEqual([false, false, false, false])
    })

    it('should_render_the_sections_in_read_often_to_touched_rarely_order', async () => {
      render(await HorseDetailPage({ params: pageParams }))
      const titles = Array.from(document.querySelectorAll('details summary h2')).map((h) => h.textContent)
      expect(titles).toEqual([
        'Feed & Medication',
        'Upcoming Lessons',
        'Documents',
        'Access',
        'Horse Settings',
      ])
    })

    function hintFor(title: string): string | undefined {
      return screen
        .getByRole('heading', { name: title })
        .closest('summary')
        ?.querySelector('h2 + span')?.textContent ?? undefined
    }

    it('should_show_the_document_count_on_the_collapsed_documents_row', async () => {
      vi.mocked(getDocumentsWithUrls).mockResolvedValue([
        { doc: mockDoc as any, signedUrl: 'https://example.com/a' },
        { doc: { ...mockDoc, id: 'doc-2' } as any, signedUrl: 'https://example.com/b' },
      ])
      render(await HorseDetailPage({ params: pageParams }))
      expect(hintFor('Documents')).toBe('2')
    })

    it('should_show_the_upcoming_lesson_count_on_the_collapsed_row', async () => {
      vi.mocked(getUpcomingLessonsForHorse).mockResolvedValue([
        { id: 'lesson-1', lessonAt: instant('2026-02-01T15:00:00Z') },
      ])
      render(await HorseDetailPage({ params: pageParams }))
      expect(hintFor('Upcoming Lessons')).toBe('1')
    })

    // #1549: the hint counts the table's *rows*, which is the owner's synthesised row plus every
    // grant that isn't the owner's — not `grants.length`, which would undercount by one on the
    // majority of horses and disagree with what opening the section shows.
    it('should_show_the_singular_row_count_on_the_collapsed_access_row', async () => {
      vi.mocked(getHorsePrivileges).mockResolvedValue([])
      render(await HorseDetailPage({ params: pageParams }))
      expect(hintFor('Access')).toBe('1 member')
    })

    it('should_count_the_owner_alongside_the_grants_on_the_collapsed_access_row', async () => {
      vi.mocked(getHorsePrivileges).mockResolvedValue([
        { id: 'privilege-1', member_id: 'mem-1', document_privileges: 'read', lesson_read_privileges: false } as any,
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Dana Rider']]))
      render(await HorseDetailPage({ params: pageParams }))
      expect(hintFor('Access')).toBe('2 members')
    })

    // The owner holding a grant of their own is one member and one row, not two.
    it('should_not_double_count_an_owner_who_also_holds_a_grant', async () => {
      vi.mocked(getHorsePrivileges).mockResolvedValue([
        { id: 'privilege-1', member_id: 'mem-owner', document_privileges: 'read', lesson_read_privileges: false } as any,
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-owner', 'Emery Rider']]))
      render(await HorseDetailPage({ params: pageParams }))
      expect(hintFor('Access')).toBe('1 member')
    })

    it('should_pluralise_the_row_count_on_the_collapsed_access_row', async () => {
      vi.mocked(getHorsePrivileges).mockResolvedValue([
        { id: 'privilege-1', member_id: 'mem-1', document_privileges: 'read', lesson_read_privileges: false } as any,
        { id: 'privilege-2', member_id: 'mem-2', document_privileges: 'read', lesson_read_privileges: false } as any,
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Dana Rider'], ['mem-2', 'Emery Rider']]))
      render(await HorseDetailPage({ params: pageParams }))
      expect(hintFor('Access')).toBe('3 members')
    })

    it('should_say_barn_defaults_on_the_collapsed_horse_settings_row', async () => {
      render(await HorseDetailPage({ params: pageParams }))
      expect(hintFor('Horse Settings')).toBe('barn defaults')
    })

    it('should_say_custom_on_the_collapsed_horse_settings_row_when_thresholds_are_overridden', async () => {
      vi.mocked(getHorseById).mockResolvedValue(
        createMockHorse({ id: 'horse-1', exhaustion_threshold_moderate: 3, exhaustion_threshold_high: 8 })
      )
      render(await HorseDetailPage({ params: pageParams }))
      expect(hintFor('Horse Settings')).toBe('custom')
    })

    it('should_say_not_set_on_the_collapsed_feed_and_medication_row_when_both_notes_are_null', async () => {
      render(await HorseDetailPage({ params: pageParams }))
      expect(hintFor('Feed & Medication')).toBe('not set')
    })

    it('should_show_no_hint_on_the_feed_and_medication_row_when_notes_are_set', async () => {
      vi.mocked(getHorseById).mockResolvedValue(horseWithNotes)
      render(await HorseDetailPage({ params: pageParams }))
      expect(hintFor('Feed & Medication')).toBeUndefined()
    })

    // The section is the same for every role; only its contents differ.
    it('should_render_the_notes_form_in_feed_and_medication_for_a_manager', async () => {
      render(await HorseDetailPage({ params: pageParams }))
      expect(screen.getByTestId('horse-notes-form')).toBeDefined()
    })

    it('should_render_only_the_header_and_feed_and_medication_for_an_unprivileged_rider', async () => {
      mockRequireMembershipAs(riderMembership)
      render(await HorseDetailPage({ params: pageParams }))
      const titles = Array.from(document.querySelectorAll('details summary h2')).map((h) => h.textContent)
      expect(titles).toEqual(['Feed & Medication'])
    })

    it('should_render_feed_and_medication_upcoming_lessons_and_documents_for_a_trainer', async () => {
      mockRequireMembershipAs(trainerMembership)
      render(await HorseDetailPage({ params: pageParams }))
      const titles = Array.from(document.querySelectorAll('details summary h2')).map((h) => h.textContent)
      expect(titles).toEqual(['Feed & Medication', 'Upcoming Lessons', 'Documents'])
    })
  })
})
