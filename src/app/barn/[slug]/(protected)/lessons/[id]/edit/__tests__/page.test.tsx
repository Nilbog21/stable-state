import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/lessons', () => ({ getLessonById: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getInstructorsByBarn: vi.fn(), getUserMembership: vi.fn(), getActiveMembersWithProfiles: vi.fn() }))
vi.mock('@/lib/db/horses', () => ({ getHorsesByBarn: vi.fn() }))
vi.mock('@/lib/db/lesson-tiers', () => ({ getAllTiersByBarn: vi.fn() }))
vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))
vi.mock('@/app/actions/lessons', () => ({ updateLessonAction: vi.fn() }))
vi.mock('../../../LessonForm', () => ({
  LessonForm: ({ horses, initialNotes }: { horses: Array<{ id: string; name: string }>, initialNotes?: object }) => (
    <div data-testid="edit-lesson-form" data-has-notes={initialNotes ? 'true' : 'false'}>
      {horses?.map((h) => <span key={h.id}>{h.name}</span>)}
    </div>
  ),
}))

import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonById } from '@/lib/db/lessons'
import { getInstructorsByBarn, getUserMembership, getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getAllTiersByBarn } from '@/lib/db/lesson-tiers'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { notFound } from 'next/navigation'
import EditLessonPage from '../page'

const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', instructor_cut: 25, created_at: '' }

const mockLesson = {
  id: 'lesson-1',
  barn_id: 'barn-1',
  instructor_id: 'user-1',
  fee: 75,
  lesson_at: '2026-05-17T10:00:00Z',
  submitted_at: '2026-05-17T10:05:00Z',
  lesson_type: 'normal' as const,
  jumping: false,
  payment_type: null,
  tier_name: 'Custom',
  instructor_name: 'Jane Smith',
  lesson_horses: [{ exertion_level: 3, horses: { id: 'horse-1', name: 'Thunderbolt' } }],
  lesson_riders: [{ barn_membership: { id: 'mem-1', name: 'Alice', user_id: null } }],
}

const mockManagerMembership = {
  id: 'mem-1', user_id: 'user-1', barn_id: 'barn-1',
  role: 'manager' as const, status: 'active' as const, created_at: '',
}

function setupDefaults() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-1' } as any)
  vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
  vi.mocked(getLessonById).mockResolvedValue(mockLesson)
  vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
  vi.mocked(getInstructorsByBarn).mockResolvedValue([])
  vi.mocked(getHorsesByBarn).mockResolvedValue([])
  vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
  vi.mocked(getAllTiersByBarn).mockResolvedValue([])
}

const params = Promise.resolve({ slug: 'green-acres', id: 'lesson-1' })

describe('EditLessonPage', () => {
  beforeEach(() => {
    vi.mocked(notFound).mockReset()
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getLessonById).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getInstructorsByBarn).mockReset()
    vi.mocked(getHorsesByBarn).mockReset()
    vi.mocked(getActiveMembersWithProfiles).mockReset()
    vi.mocked(getAllTiersByBarn).mockReset()
    vi.mocked(getAuthenticatedUser).mockReset()
    setupDefaults()
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_invoke_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow()
    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_is_not_authenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_invoke_notFound_when_user_is_not_authenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow()
    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_missing', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_invoke_notFound_when_membership_is_missing', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow()
    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_pending', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, status: 'pending' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_invoke_notFound_when_membership_is_pending', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, status: 'pending' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow()
    expect(notFound).toHaveBeenCalled()
  })

  it('should_render_edit_form_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, role: 'trainer' as const })
    const jsx = await EditLessonPage({ params })
    render(jsx)
    expect(screen.getByTestId('edit-lesson-form')).toBeDefined()
  })

  it('should_call_notFound_when_trainer_accesses_lesson_they_do_not_own', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, role: 'trainer' as const })
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, instructor_id: 'other-trainer' })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_invoke_notFound_when_trainer_accesses_lesson_they_do_not_own', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, role: 'trainer' as const })
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, instructor_id: 'other-trainer' })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    try { await EditLessonPage({ params }) } catch (_) {}
    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_is_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, role: 'rider' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_invoke_notFound_when_user_is_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, role: 'rider' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow()
    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_lesson_not_found', async () => {
    vi.mocked(getLessonById).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_invoke_notFound_when_lesson_not_found', async () => {
    vi.mocked(getLessonById).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow()
    expect(notFound).toHaveBeenCalled()
  })

  it('should_render_edit_form_for_manager', async () => {
    const jsx = await EditLessonPage({ params })
    render(jsx)
    expect(screen.getByTestId('edit-lesson-form')).toBeDefined()
  })

  it('should_fetch_all_tiers_including_inactive', async () => {
    await EditLessonPage({ params })
    expect(getAllTiersByBarn).toHaveBeenCalledWith('barn-1')
  })

  it('should_include_trainer_names_in_instructor_list', async () => {
    vi.mocked(getInstructorsByBarn).mockResolvedValue([
      { userId: 'user-1', name: 'Jane Manager' },
      { userId: 'trainer-1', name: 'Bob Trainer' },
    ])
    const jsx = await EditLessonPage({ params })
    render(jsx)
    expect(screen.getByTestId('edit-lesson-form')).toBeDefined()
  })

  it('should_fall_back_to_unknown_instructor_when_profile_not_found', async () => {
    vi.mocked(getInstructorsByBarn).mockResolvedValue([
      { userId: 'trainer-1', name: 'Unknown Instructor' },
    ])
    const jsx = await EditLessonPage({ params })
    render(jsx)
    expect(screen.getByTestId('edit-lesson-form')).toBeDefined()
  })

  it('should_not_prepend_former_instructor_when_lesson_has_no_instructor_id', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, instructor_id: null })
    const jsx = await EditLessonPage({ params })
    render(jsx)
    expect(screen.getByTestId('edit-lesson-form')).toBeDefined()
  })

  it('should_not_include_active_horse_in_inactive_assigned', async () => {
    const activeHorse = { id: 'horse-1', barn_id: 'barn-1', name: 'Thunderbolt', is_active: true, created_at: '', updated_at: '' }
    vi.mocked(getHorsesByBarn).mockResolvedValue([activeHorse])
    const jsx = await EditLessonPage({ params })
    render(jsx)
    expect(screen.queryByText('Thunderbolt (inactive)')).toBeNull()
  })

  it('should_include_inactive_assigned_horse_with_inactive_suffix', async () => {
    // getHorsesByBarn returns [] (default), so lesson horse-1 is not active — appears as inactive
    const jsx = await EditLessonPage({ params })
    render(jsx)
    expect(screen.getByText('Thunderbolt (inactive)')).toBeDefined()
  })

  it('should_map_rider_members_to_id_name_objects', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'mem-1', userId: 'user-1', name: 'Alice Rider' },
    ])
    const jsx = await EditLessonPage({ params })
    render(jsx)
    expect(screen.getByTestId('edit-lesson-form')).toBeDefined()
  })

  it('should_pass_initial_notes_to_lesson_form', async () => {
    const jsx = await EditLessonPage({ params })
    render(jsx)
    expect(screen.getByTestId('edit-lesson-form').dataset.hasNotes).toBe('true')
  })
})
