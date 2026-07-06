import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('../UpcomingLessonCard', () => ({
  UpcomingLessonCard: ({ role, slug, lesson, viewerMembershipId }: { role: string; slug: string; lesson: { id: string }; viewerMembershipId?: string }) => (
    <div data-testid="upcoming-card" data-role={role} data-slug={slug} data-lesson-id={lesson.id} data-viewer-membership-id={viewerMembershipId} />
  ),
  isSameLocalDay: (date: Date, now: Date) =>
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate(),
}))

import { UpcomingLessonsSections } from '../UpcomingLessonsSections'
import { createMockLesson } from '@/test/fixtures'
import type { LessonWithDetails } from '@/lib/db/types'

function makeLesson(overrides: Partial<LessonWithDetails> = {}): LessonWithDetails {
  return {
    ...createMockLesson(),
    instructor_name: null,
    horse_names: [],
    horse_count: 0,
    rider_names: [],
    rider_count: 0,
    ...overrides,
  }
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
    render(<UpcomingLessonsSections lessons={[]} role="manager" slug="green-acres" />)
    expect(screen.getByText("You're all clear")).toBeDefined()
  })

  it('should_show_empty_state_subtext_when_no_lessons', () => {
    render(<UpcomingLessonsSections lessons={[]} role="manager" slug="green-acres" />)
    expect(screen.getByText('No lessons scheduled for the next 7 days.')).toBeDefined()
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
})
