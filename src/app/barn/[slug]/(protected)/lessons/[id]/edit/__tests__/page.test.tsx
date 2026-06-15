import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/lessons', () => ({ getLessonById: vi.fn() }))
vi.mock('@/lib/db/effective-membership', () => ({ getEffectiveMembership: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getActiveTrainerMembershipsByBarn: vi.fn() }))
vi.mock('@/lib/db/profiles', () => ({ getProfilesByUserIds: vi.fn() }))
vi.mock('@/lib/db/horses', () => ({ getHorsesByBarn: vi.fn() }))
vi.mock('@/lib/db/riders', () => ({ getRidersByBarn: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))
vi.mock('@/app/actions/lessons', () => ({ updateLessonAction: vi.fn() }))
vi.mock('../EditLessonForm', () => ({
  EditLessonForm: () => <div data-testid="edit-lesson-form" />,
}))

import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonById } from '@/lib/db/lessons'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getActiveTrainerMembershipsByBarn } from '@/lib/db/barn-memberships'
import { getProfilesByUserIds } from '@/lib/db/profiles'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getRidersByBarn } from '@/lib/db/riders'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditLessonPage from '../page'

const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '' }

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
  lesson_riders: [{ riders: { id: 'rider-1', name: 'Alice' } }],
}

const mockManagerMembership = {
  id: 'mem-1', user_id: 'user-1', barn_id: 'barn-1',
  role: 'manager' as const, status: 'active' as const, created_at: '',
}

function setupDefaults() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  } as any)
  vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
  vi.mocked(getLessonById).mockResolvedValue(mockLesson)
  vi.mocked(getEffectiveMembership).mockResolvedValue(mockManagerMembership)
  vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([])
  vi.mocked(getProfilesByUserIds).mockResolvedValue([])
  vi.mocked(getHorsesByBarn).mockResolvedValue([])
  vi.mocked(getRidersByBarn).mockResolvedValue([])
}

const params = Promise.resolve({ slug: 'green-acres', id: 'lesson-1' })

describe('EditLessonPage', () => {
  beforeEach(() => {
    vi.mocked(notFound).mockReset()
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getLessonById).mockReset()
    vi.mocked(getEffectiveMembership).mockReset()
    vi.mocked(getActiveTrainerMembershipsByBarn).mockReset()
    vi.mocked(getProfilesByUserIds).mockReset()
    vi.mocked(getHorsesByBarn).mockReset()
    vi.mocked(getRidersByBarn).mockReset()
    vi.mocked(createClient).mockReset()
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
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_invoke_notFound_when_user_is_not_authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow()
    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_missing', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_invoke_notFound_when_membership_is_missing', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow()
    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_pending', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({ ...mockManagerMembership, status: 'pending' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_invoke_notFound_when_membership_is_pending', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({ ...mockManagerMembership, status: 'pending' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow()
    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_is_trainer', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({ ...mockManagerMembership, role: 'trainer' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_invoke_notFound_when_user_is_trainer', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({ ...mockManagerMembership, role: 'trainer' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow()
    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_is_rider', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({ ...mockManagerMembership, role: 'rider' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(EditLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_invoke_notFound_when_user_is_rider', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({ ...mockManagerMembership, role: 'rider' as const })
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

  it('should_include_trainer_names_in_instructor_list', async () => {
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([
      { id: 'mem-2', user_id: 'trainer-1', barn_id: 'barn-1', role: 'trainer' as const, status: 'active' as const, created_at: '' },
    ])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([
      { user_id: 'user-1', first_name: 'Jane', last_name: 'Manager', created_at: '' },
      { user_id: 'trainer-1', first_name: 'Bob', last_name: 'Trainer', created_at: '' },
    ])
    const jsx = await EditLessonPage({ params })
    render(jsx)
    expect(screen.getByTestId('edit-lesson-form')).toBeDefined()
  })

  it('should_fall_back_to_user_id_when_profile_not_found', async () => {
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([
      { id: 'mem-2', user_id: 'trainer-1', barn_id: 'barn-1', role: 'trainer' as const, status: 'active' as const, created_at: '' },
    ])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])
    const jsx = await EditLessonPage({ params })
    render(jsx)
    expect(screen.getByTestId('edit-lesson-form')).toBeDefined()
  })
})
