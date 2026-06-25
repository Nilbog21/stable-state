import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/lessons', () => ({
  getLessonsByBarn: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}))

vi.mock('@/app/actions/lessons', () => ({
  deleteLessonAction: vi.fn(),
}))

vi.mock('../DeleteLessonButton', () => ({
  DeleteLessonButton: ({ action }: { action: () => void }) => (
    <button type="button" onClick={action}>Delete</button>
  ),
}))

vi.mock('../OlderLessonsToggle', () => ({
  OlderLessonsToggle: () => null,
}))

import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonsByBarn } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { notFound } from 'next/navigation'
import LessonsPage from '../page'

const mockBarn = {
  id: 'barn-1',
  name: 'Green Acres',
  slug: 'green-acres',
  created_at: '2026-01-01T00:00:00Z',
}

const mockLesson = {
  id: 'lesson-1',
  barn_id: 'barn-1',
  instructor_id: 'user-1',
  fee: 75,
  lesson_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  submitted_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  instructor_name: 'John Doe',
  horse_names: ['Thunderbolt'],
  horse_ids: ['horse-1'],
  horse_count: 1,
  rider_names: ['Alice'],
  rider_ids: ['rider-1'],
  rider_count: 1,
}

const mockTrainerMembership = {
  id: 'mem-1',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'trainer' as const,
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00Z',
}

const mockManagerMembership = {
  ...mockTrainerMembership,
  role: 'manager' as const,
}

const mockRiderMembership = {
  ...mockTrainerMembership,
  role: 'rider' as const,
}

function mockSupabaseUser(userId = 'user-1') {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: userId } as any)
}

describe('LessonsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getLessonsByBarn).mockResolvedValue([mockLesson])
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    mockSupabaseUser()
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })

    await expect(
      LessonsPage({ params: Promise.resolve({ slug: 'unknown' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })

    await expect(
      LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_is_not_authenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })

    await expect(
      LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_render_lessons_list', async () => {
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /lessons/i })).toBeDefined()
  })

  it('should_show_empty_state_when_no_lessons', async () => {
    vi.mocked(getLessonsByBarn).mockResolvedValue([])
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/no lessons/i)).toBeDefined()
  })

  it('should_show_empty_state_subtext_when_no_lessons', async () => {
    vi.mocked(getLessonsByBarn).mockResolvedValue([])
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Lessons you record will appear here.')).toBeDefined()
  })

  it('should_show_new_lesson_cta_in_empty_state_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getLessonsByBarn).mockResolvedValue([])
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByRole('link', { name: /new lesson/i }).length).toBeGreaterThan(0)
  })

  it('should_show_new_lesson_cta_in_empty_state_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    vi.mocked(getLessonsByBarn).mockResolvedValue([])
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByRole('link', { name: /new lesson/i }).length).toBeGreaterThan(0)
  })

  it('should_not_show_new_lesson_cta_in_empty_state_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    vi.mocked(getLessonsByBarn).mockResolvedValue([])
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: /new lesson/i })).toBeNull()
  })

  it('should_not_show_delete_button_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('should_show_delete_button_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('button', { name: /delete/i })).toBeDefined()
  })

  it('should_show_new_lesson_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /new lesson/i })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/lessons/new')
  })

  it('should_show_new_lesson_link_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /new lesson/i })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/lessons/new')
  })

  it('should_not_show_new_lesson_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: /new lesson/i })).toBeNull()
  })

  it('should_display_instructor_name', async () => {
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('John Doe')).toBeDefined()
  })

  it('should_display_horse_names', async () => {
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
  })

  it('should_display_rider_names', async () => {
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
  })

  it('should_link_each_lesson_row_to_its_detail_page', async () => {
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const links = screen.getAllByRole('link')
    const detailLinks = links.filter(
      (l) => (l as HTMLAnchorElement).href?.includes('/barn/green-acres/lessons/lesson-1')
    )
    expect(detailLinks.length).toBeGreaterThan(0)
  })

  it('should_show_recent_lesson_by_default', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    vi.mocked(getLessonsByBarn).mockResolvedValue([{
      ...mockLesson,
      id: 'lesson-recent',
      lesson_at: threeDaysAgo,
      horse_names: ['RecentHorse'],
      horse_count: 1,
      rider_names: ['RecentRider'],
      rider_count: 1,
    }])
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('RecentHorse')).toBeDefined()
  })

  it('should_not_show_older_lesson_by_default', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    vi.mocked(getLessonsByBarn).mockResolvedValue([{
      ...mockLesson,
      id: 'lesson-old',
      lesson_at: tenDaysAgo,
      horse_names: ['OldHorse'],
      horse_count: 1,
      rider_names: ['OldRider'],
      rider_count: 1,
    }])
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('OldHorse')).toBeNull()
  })

  it('should_not_render_recent_list_when_all_lessons_are_older_than_cutoff', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    vi.mocked(getLessonsByBarn).mockResolvedValue([{
      ...mockLesson,
      id: 'lesson-old',
      lesson_at: tenDaysAgo,
    }])
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('should_call_getLessonsByBarn_with_manager_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(getLessonsByBarn).toHaveBeenCalledWith('barn-1', 'user-1', 'manager')
  })

  it('should_call_getLessonsByBarn_with_trainer_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(getLessonsByBarn).toHaveBeenCalledWith('barn-1', 'user-1', 'trainer')
  })

  it('should_call_getLessonsByBarn_with_rider_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(getLessonsByBarn).toHaveBeenCalledWith('barn-1', 'user-1', 'rider')
  })

  it('should_not_show_filter_bar_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: /^all$/i })).toBeNull()
  })

  it('should_show_all_lessons_when_no_filter_params', async () => {
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
  })

  it('should_show_all_pill_for_trainer', async () => {
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: /^all$/i })).toBeDefined()
  })

  it('should_show_rider_name_pill_for_trainer', async () => {
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: /^alice$/i })).toBeDefined()
  })

  it('should_show_matching_lesson_when_filtering_by_rider_for_trainer', async () => {
    const matchingLesson = { ...mockLesson, id: 'lesson-match', rider_names: ['Alice'], rider_ids: ['rider-1'] }
    const nonMatchingLesson = { ...mockLesson, id: 'lesson-other', horse_names: ['Spirit'], rider_names: ['Bob'], rider_ids: ['rider-2'] }
    vi.mocked(getLessonsByBarn).mockResolvedValue([matchingLesson, nonMatchingLesson])
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'rider', id: 'rider-1' }),
    })
    render(jsx)
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
  })

  it('should_hide_non_matching_lesson_when_filtering_by_rider_for_trainer', async () => {
    const matchingLesson = { ...mockLesson, id: 'lesson-match', rider_names: ['Alice'], rider_ids: ['rider-1'] }
    const nonMatchingLesson = { ...mockLesson, id: 'lesson-other', horse_names: ['Spirit'], rider_names: ['Bob'], rider_ids: ['rider-2'] }
    vi.mocked(getLessonsByBarn).mockResolvedValue([matchingLesson, nonMatchingLesson])
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'rider', id: 'rider-1' }),
    })
    render(jsx)
    expect(screen.queryByText('Spirit')).toBeNull()
  })

  it('should_show_first_lesson_for_trainer_when_filter_is_rider_with_no_id', async () => {
    const lesson2 = { ...mockLesson, id: 'lesson-2', rider_names: ['Bob'], rider_ids: ['rider-2'] }
    vi.mocked(getLessonsByBarn).mockResolvedValue([mockLesson, lesson2])
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'rider' }),
    })
    render(jsx)
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
  })

  it('should_show_second_lesson_for_trainer_when_filter_is_rider_with_no_id', async () => {
    const lesson2 = { ...mockLesson, id: 'lesson-2', rider_names: ['Bob'], rider_ids: ['rider-2'] }
    vi.mocked(getLessonsByBarn).mockResolvedValue([mockLesson, lesson2])
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'rider' }),
    })
    render(jsx)
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0)
  })

  it('should_show_by_trainer_pill_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: /by trainer/i })).toBeDefined()
  })

  it('should_show_by_rider_pill_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: /by rider/i })).toBeDefined()
  })

  it('should_show_matching_lesson_when_filtering_by_trainer_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const matchingLesson = { ...mockLesson, id: 'lesson-match', instructor_id: 'user-1', instructor_name: 'John Doe', rider_names: ['Alice'], rider_ids: ['rider-1'] }
    const nonMatchingLesson = { ...mockLesson, id: 'lesson-other', instructor_id: 'user-2', instructor_name: 'Jane Smith', horse_names: ['Spirit'], rider_names: ['Bob'], rider_ids: ['rider-2'] }
    vi.mocked(getLessonsByBarn).mockResolvedValue([matchingLesson, nonMatchingLesson])
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'trainer', id: 'user-1' }),
    })
    render(jsx)
    expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0)
  })

  it('should_hide_non_matching_lesson_when_filtering_by_trainer_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const matchingLesson = { ...mockLesson, id: 'lesson-match', instructor_id: 'user-1', instructor_name: 'John Doe', rider_names: ['Alice'], rider_ids: ['rider-1'] }
    const nonMatchingLesson = { ...mockLesson, id: 'lesson-other', instructor_id: 'user-2', instructor_name: 'Jane Smith', horse_names: ['Spirit'], rider_names: ['Bob'], rider_ids: ['rider-2'] }
    vi.mocked(getLessonsByBarn).mockResolvedValue([matchingLesson, nonMatchingLesson])
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'trainer', id: 'user-1' }),
    })
    render(jsx)
    expect(screen.queryByText('Spirit')).toBeNull()
  })

  it('should_show_matching_lesson_when_filtering_by_rider_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const matchingLesson = { ...mockLesson, id: 'lesson-match', rider_names: ['Alice'], rider_ids: ['rider-1'] }
    const nonMatchingLesson = { ...mockLesson, id: 'lesson-other', horse_names: ['Spirit'], rider_names: ['Bob'], rider_ids: ['rider-2'] }
    vi.mocked(getLessonsByBarn).mockResolvedValue([matchingLesson, nonMatchingLesson])
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'rider', id: 'rider-1' }),
    })
    render(jsx)
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
  })

  it('should_hide_non_matching_lesson_when_filtering_by_rider_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const matchingLesson = { ...mockLesson, id: 'lesson-match', rider_names: ['Alice'], rider_ids: ['rider-1'] }
    const nonMatchingLesson = { ...mockLesson, id: 'lesson-other', horse_names: ['Spirit'], rider_names: ['Bob'], rider_ids: ['rider-2'] }
    vi.mocked(getLessonsByBarn).mockResolvedValue([matchingLesson, nonMatchingLesson])
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'rider', id: 'rider-1' }),
    })
    render(jsx)
    expect(screen.queryByText('Spirit')).toBeNull()
  })

  it('should_show_first_lesson_for_manager_when_filter_is_trainer_with_no_id', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const lesson2 = { ...mockLesson, id: 'lesson-2', instructor_id: 'user-2', instructor_name: 'Jane Smith', rider_names: ['Bob'], rider_ids: ['rider-2'] }
    vi.mocked(getLessonsByBarn).mockResolvedValue([mockLesson, lesson2])
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'trainer' }),
    })
    render(jsx)
    expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0)
  })

  it('should_show_second_lesson_for_manager_when_filter_is_trainer_with_no_id', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const lesson2 = { ...mockLesson, id: 'lesson-2', instructor_id: 'user-2', instructor_name: 'Jane Smith', rider_names: ['Bob'], rider_ids: ['rider-2'] }
    vi.mocked(getLessonsByBarn).mockResolvedValue([mockLesson, lesson2])
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'trainer' }),
    })
    render(jsx)
    expect(screen.getAllByText('Jane Smith').length).toBeGreaterThan(0)
  })

  it('should_show_active_pill_style_for_selected_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'trainer', id: 'user-1' }),
    })
    render(jsx)
    const pills = screen.getAllByRole('link', { name: /john doe/i })
    expect(pills.some((p) => p.className.includes('bg-zinc-900'))).toBe(true)
  })

  it('should_show_active_pill_style_for_selected_rider', async () => {
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'rider', id: 'rider-1' }),
    })
    render(jsx)
    const pills = screen.getAllByRole('link', { name: /alice/i })
    expect(pills.some((p) => p.className.includes('bg-zinc-900'))).toBe(true)
  })

  it('should_show_by_horse_pill_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: /by horse/i })).toBeDefined()
  })

  it('should_not_show_by_horse_pill_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: /by horse/i })).toBeNull()
  })

  it('should_not_show_by_horse_pill_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await LessonsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: /by horse/i })).toBeNull()
  })

  it('should_show_horse_name_pills_when_filter_is_horse', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'horse' }),
    })
    render(jsx)
    expect(screen.getByRole('link', { name: /thunderbolt/i })).toBeDefined()
  })

  it('should_show_matching_lesson_when_filtering_by_horse_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const matchingLesson = { ...mockLesson, id: 'lesson-match', horse_names: ['Thunderbolt'], horse_ids: ['horse-1'] }
    const nonMatchingLesson = { ...mockLesson, id: 'lesson-other', horse_names: ['Spirit'], horse_ids: ['horse-2'], rider_names: ['Bob'], rider_ids: ['rider-2'] }
    vi.mocked(getLessonsByBarn).mockResolvedValue([matchingLesson, nonMatchingLesson])
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'horse', id: 'horse-1' }),
    })
    render(jsx)
    expect(screen.getAllByText('Thunderbolt').length).toBeGreaterThan(0)
  })

  it('should_hide_non_matching_lesson_when_filtering_by_horse_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const matchingLesson = { ...mockLesson, id: 'lesson-match', horse_names: ['Thunderbolt'], horse_ids: ['horse-1'] }
    const nonMatchingLesson = { ...mockLesson, id: 'lesson-other', horse_names: ['Spirit'], horse_ids: ['horse-2'], rider_names: ['Bob'], rider_ids: ['rider-2'] }
    vi.mocked(getLessonsByBarn).mockResolvedValue([matchingLesson, nonMatchingLesson])
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'horse', id: 'horse-1' }),
    })
    render(jsx)
    expect(screen.queryByText('Spirit')).toBeNull()
  })

  it('should_show_active_pill_style_for_selected_horse', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'horse', id: 'horse-1' }),
    })
    render(jsx)
    const pills = screen.getAllByRole('link', { name: /thunderbolt/i })
    expect(pills.some((p) => p.className.includes('bg-zinc-900'))).toBe(true)
  })

  it('should_show_all_lessons_when_filter_is_horse_with_no_id', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const lesson2 = { ...mockLesson, id: 'lesson-2', horse_names: ['Spirit'], horse_ids: ['horse-2'], rider_names: ['Bob'], rider_ids: ['rider-2'] }
    vi.mocked(getLessonsByBarn).mockResolvedValue([mockLesson, lesson2])
    const jsx = await LessonsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ filter: 'horse' }),
    })
    render(jsx)
    expect(screen.getAllByText('Thunderbolt').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Spirit').length).toBeGreaterThan(0)
  })
})
