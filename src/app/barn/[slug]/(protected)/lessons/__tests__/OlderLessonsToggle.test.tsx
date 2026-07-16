import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

import { OlderLessonsToggle } from '../OlderLessonsToggle'
import type { LessonWithDetails } from '@/lib/db/types'

const mockLesson: LessonWithDetails = {
  id: 'lesson-old-1',
  barn_id: 'barn-1',
  instructor_id: 'user-1',
  instructor_name: 'Jane Smith',
  fee: 50,
  lesson_at: '2026-01-01T10:00:00Z',
  submitted_at: '2026-01-01T10:05:00Z',
  lesson_type: 'normal',
  jumping: false,
  payment_type: null,
  tier_name: 'Custom',
  cancelled_at: null,
  cancellation_notes: null,
  series_id: null,
  instructor_cut: 0,
  horse_names: ['Comet'],
  horse_ids: ['horse-1'],
  horse_count: 1,
  rider_names: ['Bob'],
  rider_ids: ['rider-mem-1'],
  rider_count: 1,
  rider_cancelled_ats: [null],
  needs_attention: false,
}

describe('OlderLessonsToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_not_render_button_when_no_older_lessons', () => {
    render(
      <OlderLessonsToggle
        lessons={[]}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
      />
    )
    expect(screen.queryByRole('button', { name: /show older lessons/i })).toBeNull()
  })

  it('should_render_show_older_lessons_button_when_lessons_exist', () => {
    render(
      <OlderLessonsToggle
        lessons={[mockLesson]}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
      />
    )
    expect(screen.getByRole('button', { name: /show older lessons/i })).toBeDefined()
  })

  it('should_hide_older_lessons_by_default', () => {
    render(
      <OlderLessonsToggle
        lessons={[mockLesson]}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
      />
    )
    expect(screen.queryByText('Comet')).toBeNull()
  })

  it('should_show_older_lessons_after_clicking_button', () => {
    render(
      <OlderLessonsToggle
        lessons={[mockLesson]}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show older lessons/i }))
    expect(screen.getByText('Comet')).toBeDefined()
  })

  it('should_use_spacing_between_older_lesson_rows', () => {
    render(
      <OlderLessonsToggle
        lessons={[mockLesson]}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show older lessons/i }))
    const list = screen.getByRole('list')
    expect(list.className).toContain('space-y-2')
  })

  it('should_not_use_divider_borders_between_older_lesson_rows', () => {
    render(
      <OlderLessonsToggle
        lessons={[mockLesson]}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show older lessons/i }))
    const list = screen.getByRole('list')
    expect(list.className).not.toContain('divide-y')
  })

  it('should_show_hide_older_lessons_button_label_after_expanding', () => {
    render(
      <OlderLessonsToggle
        lessons={[mockLesson]}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show older lessons/i }))
    expect(screen.getByRole('button', { name: /hide older lessons/i })).toBeDefined()
  })

  it('should_collapse_older_lessons_after_clicking_button_again', () => {
    render(
      <OlderLessonsToggle
        lessons={[mockLesson]}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show older lessons/i }))
    fireEvent.click(screen.getByRole('button', { name: /hide older lessons/i }))
    expect(screen.queryByText('Comet')).toBeNull()
  })

  it('should_display_rider_name_in_older_lessons_for_manager', () => {
    render(
      <OlderLessonsToggle
        lessons={[mockLesson]}
        slug="green-acres"
        isManager={true}
        isTrainer={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show older lessons/i }))
    expect(screen.getByText('Bob')).toBeDefined()
  })

  it('should_never_show_cancel_link_regardless_of_role', () => {
    render(
      <OlderLessonsToggle
        lessons={[{ ...mockLesson, lesson_at: '2099-01-01T10:00:00Z' }]}
        slug="green-acres"
        isManager={true}
        isTrainer={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show older lessons/i }))
    expect(screen.queryByRole('link', { name: 'Cancel' })).toBeNull()
  })

  it('should_pass_viewer_membership_id_through_to_lesson_list_item', () => {
    render(
      <OlderLessonsToggle
        lessons={[{ ...mockLesson, lesson_at: '2099-01-01T10:00:00Z', rider_ids: ['viewer-mem-1'], rider_cancelled_ats: ['2026-01-01T00:00:00Z'] }]}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        viewerMembershipId="viewer-mem-1"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show older lessons/i }))
    expect(screen.getByText('Cancelled')).toBeDefined()
  })
})
