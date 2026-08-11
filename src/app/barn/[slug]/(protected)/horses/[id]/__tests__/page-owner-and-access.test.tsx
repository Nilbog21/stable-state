import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
const ownedHorse = createMockHorse({
  id: 'horse-1',
  name: 'Thunderbolt',
  is_available: true,
  owning_member_id: 'mem-owner',
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

  // #1286: member_horse_privileges rows carry only member_id, so getHorsePrivileges can't
  // order by name at the DB — the names are resolved here, and the Access table renders one
  // row per grant.
  it('should_order_access_grants_alphabetically_by_member_name', async () => {
    vi.mocked(getHorsePrivileges).mockResolvedValue([
      { id: 'privilege-z', barn_id: 'barn-1', member_id: 'mem-z', horse_id: 'horse-1', document_privileges: 'read', lesson_read_privileges: true, created_at: '' },
      { id: 'privilege-a', barn_id: 'barn-1', member_id: 'mem-a', horse_id: 'horse-1', document_privileges: 'read', lesson_read_privileges: true, created_at: '' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-z', 'Zoe Rider'], ['mem-a', 'Ada Rider']]))

    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)

    expect(
      Array.from(screen.getByTestId('grant-names').querySelectorAll('li')).map((li) => li.textContent)
    ).toEqual(['Ada Rider', 'Zoe Rider'])
  })

  it('should_break_an_access_grant_name_tie_on_member_id', async () => {
    vi.mocked(getHorsePrivileges).mockResolvedValue([
      { id: 'privilege-z', barn_id: 'barn-1', member_id: 'mem-z', horse_id: 'horse-1', document_privileges: 'read', lesson_read_privileges: true, created_at: '' },
      { id: 'privilege-a', barn_id: 'barn-1', member_id: 'mem-a', horse_id: 'horse-1', document_privileges: 'none', lesson_read_privileges: false, created_at: '' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-z', 'John Smith'], ['mem-a', 'John Smith']]))

    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)

    expect(
      Array.from(screen.getByTestId('grant-names').querySelectorAll('li')).map((li) => li.getAttribute('data-grant-id'))
    ).toEqual(['privilege-a', 'privilege-z'])
  })

  it('should_wire_grant_action_with_barn_slug_and_horse_id', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    fireEvent.click(screen.getByText('test-grant'))
    expect(grantHorseAccessAction).toHaveBeenCalledWith('green-acres', 'horse-1', expect.any(FormData))
  })

  it('should_wire_update_document_action_with_barn_slug_and_horse_id', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    fireEvent.click(screen.getByText('test-update-doc'))
    expect(updateHorseAccessDocumentAction).toHaveBeenCalledWith('green-acres', 'horse-1', 'privilege-1', expect.any(FormData))
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
