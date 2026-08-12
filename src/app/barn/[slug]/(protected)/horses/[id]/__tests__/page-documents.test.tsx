import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
import { calendarDate } from '@/lib/local-day'

const mockBarn = createMockBarn()
const mockUser = createMockUser()
const managerMembership = createMockMembership({ role: 'manager', status: 'active' })
const trainerMembership = createMockMembership({ role: 'trainer', status: 'active' })
const riderMembership = createMockMembership({ role: 'rider', status: 'active' })

function mockRequireMembershipAs(membership: ReturnType<typeof createMockMembership>) {
  vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership })
}

const availableHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: true, unavailability_reason: null })

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

  it('should_not_render_documents_section_for_rider_with_none_document_privilege', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMyHorseDocumentPrivilege).mockResolvedValue('none')
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('No documents yet')).toBeNull()
  })

  it('should_render_documents_section_for_rider_with_read_document_privilege', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMyHorseDocumentPrivilege).mockResolvedValue('read')
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('No documents yet')).toBeDefined()
  })

  it('should_not_render_add_document_link_for_rider_with_read_document_privilege', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMyHorseDocumentPrivilege).mockResolvedValue('read')
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByRole('link', { name: /add document/i })).toBeNull()
  })

  it('should_render_documents_section_for_rider_with_write_document_privilege', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMyHorseDocumentPrivilege).mockResolvedValue('write')
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('No documents yet')).toBeDefined()
  })

  it('should_render_add_document_link_for_rider_with_write_document_privilege', async () => {
    mockRequireMembershipAs(riderMembership)
    vi.mocked(getMyHorseDocumentPrivilege).mockResolvedValue('write')
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getAllByRole('link', { name: /add document/i }).length).toBeGreaterThan(0)
  })

  it('should_call_get_my_horse_document_privilege_with_horse_and_barn_id_for_rider', async () => {
    mockRequireMembershipAs(riderMembership)
    await HorseDetailPage({ params: pageParams })
    expect(getMyHorseDocumentPrivilege).toHaveBeenCalledWith('horse-1', 'barn-1')
  })

  it('should_not_call_get_my_horse_document_privilege_for_manager', async () => {
    await HorseDetailPage({ params: pageParams })
    expect(getMyHorseDocumentPrivilege).not.toHaveBeenCalled()
  })

  it('should_render_documents_list_for_manager_when_documents_exist', async () => {
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: mockDoc, signedUrl: 'https://example.com/signed' }] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('coggins.pdf')).toBeDefined()
  })

  // #1149 -- the reminder badge's cutoff is the barn's own day, not the viewer's. At this instant
  // a Pacific barn is still on Mar 1 while the pinned Eastern viewer's device already reads Mar 2.
  describe('reminder badge barn-local cutoff', () => {
    let originalTz: string | undefined

    beforeEach(() => {
      originalTz = process.env.TZ
      process.env.TZ = 'America/New_York'
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-03-02T06:00:00Z'))
      vi.mocked(requireMembership).mockResolvedValue({
        user: mockUser as any,
        barn: { ...mockBarn, timezone: 'America/Los_Angeles' },
        membership: managerMembership,
      })
    })

    afterEach(() => {
      vi.useRealTimers()
      process.env.TZ = originalTz
    })

    it('should_not_flag_a_reminder_as_due_when_it_is_still_future_in_barn_time', async () => {
      vi.mocked(getDocumentsWithUrls).mockResolvedValue([
        { doc: { ...mockDoc, reminder_date: calendarDate('2026-03-02') }, signedUrl: 'https://example.com/signed' },
      ] as any)

      const jsx = await HorseDetailPage({ params: pageParams })
      render(jsx)

      expect(screen.queryByText(/reminder due/i)).toBeNull()
    })

    it('should_flag_a_reminder_already_reached_in_barn_time_as_due', async () => {
      vi.mocked(getDocumentsWithUrls).mockResolvedValue([
        { doc: { ...mockDoc, reminder_date: calendarDate('2026-03-01') }, signedUrl: 'https://example.com/signed' },
      ] as any)

      const jsx = await HorseDetailPage({ params: pageParams })
      render(jsx)

      expect(screen.getByText(/reminder due/i)).toBeDefined()
    })
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
    vi.mocked(getDocumentsWithUrls).mockResolvedValue([{ doc: { ...mockDoc, reminder_date: calendarDate('2020-01-01') }, signedUrl: 'https://example.com/signed' }] as any)
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
})
