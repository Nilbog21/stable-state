import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('../UpcomingLessonCard', () => ({
  UpcomingLessonCard: ({ role, slug, lesson, viewerMembershipId }: { role: string; slug: string; lesson: { id: string }; viewerMembershipId?: string }) => (
    <div data-testid="upcoming-card" data-role={role} data-slug={slug} data-lesson-id={lesson.id} data-viewer-membership-id={viewerMembershipId} />
  ),
}))

vi.mock('../UpcomingExpenseCard', () => ({
  UpcomingExpenseCard: ({ expense, slug }: { expense: { id: string }; slug: string }) => (
    <div data-testid="upcoming-expense-card" data-slug={slug} data-expense-id={expense.id} />
  ),
}))

import { UpcomingLessonsSections } from '../UpcomingLessonsSections'
import { createMockLessonWithDetails, createMockExpenseWithHorses } from '@/test/fixtures'
import type { LessonWithDetails, ScheduledExpense } from '@/lib/db/types'

function makeLesson(overrides: Partial<LessonWithDetails> = {}): LessonWithDetails {
  return {
    ...createMockLessonWithDetails(),
    instructor_name: null,
    horse_names: [],
    horse_count: 0,
    rider_names: [],
    rider_count: 0,
    ...overrides,
  }
}

function makeExpense(overrides: Partial<ScheduledExpense> = {}): ScheduledExpense {
  return {
    ...createMockExpenseWithHorses({ expense_time: '10:00:00' }),
    ...overrides,
  } as ScheduledExpense
}

function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('UpcomingLessonsSections', () => {
  it('should_render_today_heading_when_lesson_is_today', () => {
    const today = new Date()
    render(
      <UpcomingLessonsSections
        lessons={[makeLesson({ lesson_at: today.toISOString() })]}
        role="manager"
        slug="green-acres"
      />
    )
    expect(screen.getByRole('heading', { name: 'Today' })).toBeDefined()
  })

  it('should_hide_today_heading_when_no_lesson_today', () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    render(
      <UpcomingLessonsSections
        lessons={[makeLesson({ lesson_at: future.toISOString() })]}
        role="manager"
        slug="green-acres"
      />
    )
    expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull()
  })

  it('should_render_this_week_heading_when_lessons_remain', () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    render(
      <UpcomingLessonsSections
        lessons={[makeLesson({ lesson_at: future.toISOString() })]}
        role="manager"
        slug="green-acres"
      />
    )
    expect(screen.getByRole('heading', { name: 'This Week' })).toBeDefined()
  })

  it('should_hide_this_week_heading_when_no_lessons_remain', () => {
    const today = new Date()
    render(
      <UpcomingLessonsSections
        lessons={[makeLesson({ lesson_at: today.toISOString() })]}
        role="manager"
        slug="green-acres"
      />
    )
    expect(screen.queryByRole('heading', { name: 'This Week' })).toBeNull()
  })

  it('should_show_empty_state_heading_when_no_lessons', () => {
    render(<UpcomingLessonsSections lessons={[]} role="trainer" slug="green-acres" />)
    expect(screen.getByText("You're all clear")).toBeDefined()
  })

  it('should_show_empty_state_subtext_when_no_lessons_for_trainer', () => {
    render(<UpcomingLessonsSections lessons={[]} role="trainer" slug="green-acres" />)
    expect(screen.getByText('No lessons scheduled for the next 7 days.')).toBeDefined()
  })

  it('should_show_empty_state_subtext_mentioning_expenses_for_manager', () => {
    render(<UpcomingLessonsSections lessons={[]} role="manager" slug="green-acres" />)
    expect(screen.getByText('No lessons or expenses scheduled for the next 7 days.')).toBeDefined()
  })

  it('should_render_today_heading_as_uppercase', () => {
    const today = new Date()
    render(
      <UpcomingLessonsSections
        lessons={[makeLesson({ lesson_at: today.toISOString() })]}
        role="manager"
        slug="green-acres"
      />
    )
    const heading = screen.getByRole('heading', { name: 'Today' })
    expect(heading.className).toContain('uppercase')
  })

  it('should_render_today_heading_at_text_sm_size', () => {
    const today = new Date()
    render(
      <UpcomingLessonsSections
        lessons={[makeLesson({ lesson_at: today.toISOString() })]}
        role="manager"
        slug="green-acres"
      />
    )
    const heading = screen.getByRole('heading', { name: 'Today' })
    expect(heading.className).toContain('text-sm')
  })

  it('should_exclude_future_lesson_from_today_section', () => {
    const today = new Date()
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    render(
      <UpcomingLessonsSections
        lessons={[
          makeLesson({ id: 'today-lesson', lesson_at: today.toISOString() }),
          makeLesson({ id: 'future-lesson', lesson_at: future.toISOString() }),
        ]}
        role="manager"
        slug="green-acres"
      />
    )
    expect(screen.getAllByTestId('upcoming-card').length).toBe(2)
  })

  it('should_pass_role_to_lesson_card', () => {
    const today = new Date()
    render(
      <UpcomingLessonsSections
        lessons={[makeLesson({ id: 'lesson-1', lesson_at: today.toISOString() })]}
        role="rider"
        slug="green-acres"
        viewerMembershipId="mem-1"
      />
    )
    expect(screen.getByTestId('upcoming-card').getAttribute('data-role')).toBe('rider')
  })

  it('should_pass_slug_to_lesson_card', () => {
    const today = new Date()
    render(
      <UpcomingLessonsSections
        lessons={[makeLesson({ id: 'lesson-1', lesson_at: today.toISOString() })]}
        role="rider"
        slug="green-acres"
        viewerMembershipId="mem-1"
      />
    )
    expect(screen.getByTestId('upcoming-card').getAttribute('data-slug')).toBe('green-acres')
  })

  it('should_pass_viewer_membership_id_to_lesson_card', () => {
    const today = new Date()
    render(
      <UpcomingLessonsSections
        lessons={[makeLesson({ id: 'lesson-1', lesson_at: today.toISOString() })]}
        role="rider"
        slug="green-acres"
        viewerMembershipId="mem-1"
      />
    )
    expect(screen.getByTestId('upcoming-card').getAttribute('data-viewer-membership-id')).toBe('mem-1')
  })

  it('should_render_barn_schedule_heading_for_manager', () => {
    render(<UpcomingLessonsSections lessons={[]} role="manager" slug="green-acres" />)
    expect(screen.getByRole('heading', { name: 'Barn Schedule' })).toBeDefined()
  })

  it('should_not_render_barn_schedule_heading_for_trainer', () => {
    render(<UpcomingLessonsSections lessons={[]} role="trainer" slug="green-acres" />)
    expect(screen.queryByRole('heading', { name: 'Barn Schedule' })).toBeNull()
  })

  it('should_not_render_barn_schedule_heading_for_rider', () => {
    render(<UpcomingLessonsSections lessons={[]} role="rider" slug="green-acres" />)
    expect(screen.queryByRole('heading', { name: 'Barn Schedule' })).toBeNull()
  })

  it('should_render_expense_card_for_manager_today', () => {
    const today = new Date()
    render(
      <UpcomingLessonsSections
        lessons={[]}
        expenses={[makeExpense({ id: 'expense-1', expense_date: localDateString(today) })]}
        role="manager"
        slug="green-acres"
      />
    )
    expect(screen.getByTestId('upcoming-expense-card')).toBeDefined()
  })

  it('should_not_render_expenses_for_trainer_even_when_passed', () => {
    const today = new Date()
    render(
      <UpcomingLessonsSections
        lessons={[]}
        expenses={[makeExpense({ id: 'expense-1', expense_date: localDateString(today) })]}
        role="trainer"
        slug="green-acres"
      />
    )
    expect(screen.queryByTestId('upcoming-expense-card')).toBeNull()
  })

  it('should_not_render_expenses_for_rider_even_when_passed', () => {
    const today = new Date()
    render(
      <UpcomingLessonsSections
        lessons={[]}
        expenses={[makeExpense({ id: 'expense-1', expense_date: localDateString(today) })]}
        role="rider"
        slug="green-acres"
      />
    )
    expect(screen.queryByTestId('upcoming-expense-card')).toBeNull()
  })

  it('should_pass_slug_to_expense_card', () => {
    const today = new Date()
    render(
      <UpcomingLessonsSections
        lessons={[]}
        expenses={[makeExpense({ id: 'expense-1', expense_date: localDateString(today) })]}
        role="manager"
        slug="green-acres"
      />
    )
    expect(screen.getByTestId('upcoming-expense-card').getAttribute('data-slug')).toBe('green-acres')
  })

  it('should_render_this_week_heading_for_future_expense', () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    render(
      <UpcomingLessonsSections
        lessons={[]}
        expenses={[makeExpense({ id: 'expense-1', expense_date: localDateString(future) })]}
        role="manager"
        slug="green-acres"
      />
    )
    expect(screen.getByRole('heading', { name: 'This Week' })).toBeDefined()
  })

  it('should_not_render_today_heading_for_future_expense', () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    render(
      <UpcomingLessonsSections
        lessons={[]}
        expenses={[makeExpense({ id: 'expense-1', expense_date: localDateString(future) })]}
        role="manager"
        slug="green-acres"
      />
    )
    expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull()
  })

  it('should_interleave_lesson_and_expense_by_datetime_within_a_section', () => {
    const today = new Date()
    const todayStr = localDateString(today)
    render(
      <UpcomingLessonsSections
        lessons={[makeLesson({ id: 'lesson-1', lesson_at: new Date(`${todayStr}T15:00:00.000Z`).toISOString() })]}
        expenses={[makeExpense({ id: 'expense-1', expense_date: todayStr, expense_time: '09:00:00' })]}
        role="manager"
        slug="green-acres"
      />
    )
    const items = screen.getAllByTestId(/upcoming-(card|expense-card)/)
    expect(items.map((el) => el.getAttribute('data-testid'))).toEqual(['upcoming-expense-card', 'upcoming-card'])
  })

  it('should_use_empty_state_when_manager_has_no_lessons_or_expenses', () => {
    render(<UpcomingLessonsSections lessons={[]} expenses={[]} role="manager" slug="green-acres" />)
    expect(screen.getByText("You're all clear")).toBeDefined()
  })

  it('should_skip_empty_state_when_manager_has_only_expenses', () => {
    const today = new Date()
    render(
      <UpcomingLessonsSections
        lessons={[]}
        expenses={[makeExpense({ id: 'expense-1', expense_date: localDateString(today) })]}
        role="manager"
        slug="green-acres"
      />
    )
    expect(screen.queryByText("You're all clear")).toBeNull()
  })
})
