import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { CalendarLessonCard, formatLessonTime } from '../CalendarLessonCard'
import { createMockLesson } from '@/test/fixtures'
import type { LessonWithDetails } from '@/lib/db/types'

function makeLesson(overrides: Partial<LessonWithDetails> = {}): LessonWithDetails {
  return {
    ...createMockLesson(),
    payment_type: null,
    instructor_name: 'Jane Smith',
    horse_names: ['Thunderbolt'],
    horse_ids: ['horse-1'],
    horse_count: 1,
    rider_names: ['Alice'],
    rider_ids: ['rider-mem-1'],
    rider_count: 1,
    rider_cancelled_ats: [null],
    needs_attention: false,
    ...overrides,
  }
}

describe('formatLessonTime', () => {
  it('should_format_the_lesson_start_time', () => {
    const iso = '2026-06-22T14:00:00Z'
    expect(formatLessonTime(iso)).toBe(new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
  })
})

describe('CalendarLessonCard', () => {
  it('should_render_formatted_time', () => {
    const iso = '2026-06-15T14:00:00Z'
    render(<CalendarLessonCard lesson={makeLesson({ lesson_at: iso })} role="manager" slug="green-acres" />)
    expect(screen.getByText(formatLessonTime(iso))).toBeDefined()
  })

  it('should_render_horse_names', () => {
    render(<CalendarLessonCard lesson={makeLesson()} role="manager" slug="green-acres" />)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
  })

  it('should_show_instructor_name_for_rider_role', () => {
    render(<CalendarLessonCard lesson={makeLesson()} role="rider" slug="green-acres" />)
    expect(screen.getByText('Jane Smith')).toBeDefined()
  })

  it('should_hide_instructor_name_for_manager_role', () => {
    render(<CalendarLessonCard lesson={makeLesson()} role="manager" slug="green-acres" />)
    expect(screen.queryByText('Jane Smith')).toBeNull()
  })

  it('should_hide_instructor_name_for_trainer_role', () => {
    render(<CalendarLessonCard lesson={makeLesson()} role="trainer" slug="green-acres" />)
    expect(screen.queryByText('Jane Smith')).toBeNull()
  })

  it('should_show_rider_names_for_manager_role', () => {
    render(<CalendarLessonCard lesson={makeLesson()} role="manager" slug="green-acres" />)
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_show_rider_names_for_trainer_role', () => {
    render(<CalendarLessonCard lesson={makeLesson()} role="trainer" slug="green-acres" />)
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_hide_rider_names_for_rider_role', () => {
    render(<CalendarLessonCard lesson={makeLesson()} role="rider" slug="green-acres" />)
    expect(screen.queryByText('Alice')).toBeNull()
  })

  it('should_link_to_lesson_detail_page', () => {
    render(<CalendarLessonCard lesson={makeLesson({ id: 'lesson-123' })} role="manager" slug="green-acres" />)
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/lessons/lesson-123')
  })

  it('should_show_cancelled_badge_when_cancelled_at_is_set', () => {
    render(<CalendarLessonCard lesson={makeLesson({ cancelled_at: '2026-01-01T00:00:00Z' })} role="manager" slug="green-acres" />)
    expect(screen.getByText('Cancelled')).toBeDefined()
  })

  it('should_not_show_cancelled_badge_when_cancelled_at_is_null', () => {
    render(<CalendarLessonCard lesson={makeLesson()} role="manager" slug="green-acres" />)
    expect(screen.queryByText('Cancelled')).toBeNull()
  })

  it('should_show_cancelled_badge_when_own_participation_cancelled_for_rider', () => {
    render(
      <CalendarLessonCard
        lesson={makeLesson({ rider_ids: ['viewer-mem-1'], rider_cancelled_ats: ['2026-01-01T00:00:00Z'] })}
        role="rider"
        slug="green-acres"
        viewerMembershipId="viewer-mem-1"
      />
    )
    expect(screen.getByText('Cancelled')).toBeDefined()
  })

  it('should_not_show_participation_badge_for_manager_or_trainer_role', () => {
    render(
      <CalendarLessonCard
        lesson={makeLesson({ rider_ids: ['viewer-mem-1'], rider_cancelled_ats: ['2026-01-01T00:00:00Z'] })}
        role="manager"
        slug="green-acres"
        viewerMembershipId="viewer-mem-1"
      />
    )
    expect(screen.queryByText('Cancelled')).toBeNull()
  })

  it('should_not_duplicate_badge_when_whole_lesson_already_cancelled', () => {
    render(
      <CalendarLessonCard
        lesson={makeLesson({
          cancelled_at: '2026-01-01T00:00:00Z',
          rider_ids: ['viewer-mem-1'],
          rider_cancelled_ats: ['2026-01-01T00:00:00Z'],
        })}
        role="rider"
        slug="green-acres"
        viewerMembershipId="viewer-mem-1"
      />
    )
    expect(screen.getAllByText('Cancelled').length).toBe(1)
  })

  it('should_show_needs_attention_badge_when_future_uncancelled_lesson_needs_attention', () => {
    render(
      <CalendarLessonCard
        lesson={makeLesson({ lesson_at: '2099-01-01T10:00:00Z', needs_attention: true })}
        role="manager"
        slug="green-acres"
      />
    )
    expect(screen.getByText('Needs Attention')).toBeDefined()
  })

  it('should_not_show_needs_attention_badge_when_lesson_is_in_the_past', () => {
    render(
      <CalendarLessonCard
        lesson={makeLesson({ lesson_at: '2026-01-01T10:00:00Z', needs_attention: true })}
        role="manager"
        slug="green-acres"
      />
    )
    expect(screen.queryByText('Needs Attention')).toBeNull()
  })

  it('should_not_show_needs_attention_badge_when_lesson_is_cancelled', () => {
    render(
      <CalendarLessonCard
        lesson={makeLesson({ lesson_at: '2099-01-01T10:00:00Z', needs_attention: true, cancelled_at: '2026-01-01T00:00:00Z' })}
        role="manager"
        slug="green-acres"
      />
    )
    expect(screen.queryByText('Needs Attention')).toBeNull()
  })

  it('should_not_show_needs_attention_badge_when_needs_attention_is_false', () => {
    render(
      <CalendarLessonCard
        lesson={makeLesson({ lesson_at: '2099-01-01T10:00:00Z', needs_attention: false })}
        role="manager"
        slug="green-acres"
      />
    )
    expect(screen.queryByText('Needs Attention')).toBeNull()
  })

  it('should_not_show_cancel_button_on_dashboard_card', () => {
    render(
      <CalendarLessonCard
        lesson={makeLesson({ rider_ids: ['viewer-mem-1'], rider_cancelled_ats: [null] })}
        role="rider"
        slug="green-acres"
        viewerMembershipId="viewer-mem-1"
      />
    )
    expect(screen.queryByRole('link', { name: 'Cancel' })).toBeNull()
  })
})
