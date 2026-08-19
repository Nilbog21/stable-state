import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockLessonTier, createMockHorse } from '@/test/fixtures'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/horses', () => ({
  getHorsesByBarn: vi.fn(),
  resolveExhaustionThresholds: vi.fn().mockReturnValue({ high: 11, moderate: 5 }),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getInstructorsByBarn: vi.fn(),
  getActiveMembersWithProfiles: vi.fn(),
}))

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@/app/actions/lessons', () => ({
  submitLesson: vi.fn(),
  getProjectedExhaustionForBarn: vi.fn().mockResolvedValue({}),
  getScheduleRangeForBarn: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/db/lesson-tiers', () => ({
  getTiersByBarn: vi.fn(),
}))

import { getBarnBySlug } from '@/lib/db/barns'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getUserMembership, getInstructorsByBarn, getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getTiersByBarn } from '@/lib/db/lesson-tiers'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { notFound, redirect } from 'next/navigation'
import LessonNewPage from '../page'

const mockBarn = createMockBarn()
const mockTier = createMockLessonTier({ is_default: true })

const mockHorses = [
  createMockHorse({ id: 'horse-1', barn_id: 'barn-1', name: 'Thunderbolt', created_at: '2026-01-01', updated_at: '2026-01-01' }),
  createMockHorse({ id: 'horse-2', barn_id: 'barn-1', name: 'Shadow', created_at: '2026-01-02', updated_at: '2026-01-02' }),
]

const mockRiders = [
  { membershipId: 'mem-1', userId: 'user-1', name: 'Alice', isManaged: false, inviteToken: null },
  { membershipId: 'mem-2', userId: 'user-2', name: 'Bob', isManaged: false, inviteToken: null },
]

const mockTrainerMembership = createMockMembership({ id: 'mem-1', created_at: '2026-01-01T00:00:00Z' })
const mockManagerMembership = createMockMembership({ id: 'mem-1', user_id: 'manager-1', role: 'manager', created_at: '2026-01-01T00:00:00Z' })
const mockTrainerBarnMembership = createMockMembership({ id: 'mem-2', user_id: 'trainer-2', created_at: '2026-01-01T00:00:00Z' })

function mockSupabaseUser(userId = 'user-1') {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: userId } as any)
}

describe('LessonNewPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getHorsesByBarn).mockResolvedValue(mockHorses)
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue(mockRiders)
    vi.mocked(getTiersByBarn).mockResolvedValue([mockTier])
    mockSupabaseUser()
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    vi.mocked(getInstructorsByBarn).mockResolvedValue([])
  })

  it('should_render_form_when_barn_exists', async () => {
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('button', { name: /submit/i })).toBeDefined()
  })

  it('should_render_form_when_user_has_no_membership_in_barn', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('button', { name: /submit/i })).toBeDefined()
  })

  it('should_call_notFound_when_user_is_not_authenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })

    await expect(
      LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_barn_slug_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })

    await expect(
      LessonNewPage({ params: Promise.resolve({ slug: 'unknown-slug' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_render_horse_checkboxes', async () => {
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('checkbox', { name: 'Thunderbolt' })).toBeDefined()
    expect(screen.getByRole('checkbox', { name: 'Shadow' })).toBeDefined()
  })

  it('should_render_rider_options_in_select', async () => {
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('option', { name: 'Alice' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'Bob' })).toBeDefined()
  })

  it('should_not_render_instructor_select_when_user_is_a_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByLabelText(/instructor/i)).toBeNull()
  })

  it('should_not_display_trainer_full_name_when_profile_is_found', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    vi.mocked(getInstructorsByBarn).mockResolvedValue([
      { membershipId: mockTrainerMembership.id, userId: 'user-1', name: 'John Trainer' },
    ])
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('John Trainer')).toBeNull()
  })

  it('should_render_instructor_select_when_user_is_a_manager', async () => {
    mockSupabaseUser('manager-1')
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getInstructorsByBarn).mockResolvedValue([
      { membershipId: mockManagerMembership.id, userId: 'manager-1', name: 'Jane Doe' },
    ])
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByLabelText(/instructor/i)).toBeDefined()
  })

  it('should_render_trainer_options_in_instructor_select_for_manager', async () => {
    mockSupabaseUser('manager-1')
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getInstructorsByBarn).mockResolvedValue([
      { membershipId: mockManagerMembership.id, userId: 'manager-1', name: 'Jane Doe' },
      { membershipId: mockTrainerBarnMembership.id, userId: 'trainer-2', name: 'John Smith' },
    ])
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('option', { name: 'John Smith' })).toBeDefined()
  })

  it('should_pre_select_current_user_in_instructor_select', async () => {
    mockSupabaseUser('manager-1')
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getInstructorsByBarn).mockResolvedValue([
      { membershipId: mockManagerMembership.id, userId: 'manager-1', name: 'Jane Doe' },
    ])
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const select = screen.getByLabelText(/instructor/i) as HTMLSelectElement
    expect(select.value).toBe(mockManagerMembership.id)
  })

  it('should_not_render_exertion_input_when_horse_is_unchecked', async () => {
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('spinbutton', { name: 'Exertion level for Thunderbolt' })).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: 'Exertion level for Shadow' })).toBeNull()
  })

  it('should_render_exertion_input_for_each_horse', async () => {
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Thunderbolt' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Shadow' }))
    expect(screen.getByRole('spinbutton', { name: 'Exertion level for Thunderbolt' })).toBeDefined()
    expect(screen.getByRole('spinbutton', { name: 'Exertion level for Shadow' })).toBeDefined()
  })

  it('should_default_exertion_input_to_3', async () => {
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Thunderbolt' }))
    const input = screen.getByRole('spinbutton', { name: 'Exertion level for Thunderbolt' }) as HTMLInputElement
    expect(input.defaultValue).toBe('3')
  })

  it('should_set_exertion_input_min_1_max_5', async () => {
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Thunderbolt' }))
    const input = screen.getByRole('spinbutton', { name: 'Exertion level for Thunderbolt' }) as HTMLInputElement
    expect(input.min).toBe('1')
    expect(input.max).toBe('5')
  })

  it('should_not_render_add_new_horse_input_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByPlaceholderText(/add new horse/i)).toBeNull()
  })

  it('should_call_getHorsesByBarn_with_barn_id', async () => {
    await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getHorsesByBarn).mock.calls[0][0]).toBe('barn-1')
  })

  it('should_call_getActiveMembersWithProfiles_with_barn_id', async () => {
    await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getActiveMembersWithProfiles).mock.calls[0][0]).toBe('barn-1')
  })

  it('should_call_getTiersByBarn_with_barn_id', async () => {
    await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getTiersByBarn).mock.calls[0][0]).toBe('barn-1')
  })

  it('should_throw_when_rider_visits_new_lesson_page', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'rider', created_at: '2026-01-01T00:00:00Z' }))
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_rider_to_lessons_page', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'rider', created_at: '2026-01-01T00:00:00Z' }))
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) }).catch(() => {})

    expect(redirect).toHaveBeenCalledWith('/barn/green-acres/lessons')
  })

  it('should_show_blocked_state_when_no_tiers_configured', async () => {
    vi.mocked(getTiersByBarn).mockResolvedValue([])
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('alert').textContent).toContain('No lesson tiers have been configured')
  })

})
