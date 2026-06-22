import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { UpcomingLessonCard, formatLessonDate } from '../UpcomingLessonCard'
import { createMockLesson } from '@/test/fixtures'
import type { LessonWithDetails } from '@/lib/db/types'

function makeLesson(overrides: Partial<LessonWithDetails> = {}): LessonWithDetails {
  return {
    ...createMockLesson(),
    instructor_name: 'Jane Smith',
    horse_names: ['Thunderbolt'],
    horse_count: 1,
    rider_names: ['Alice'],
    rider_count: 1,
    ...overrides,
  }
}

describe('formatLessonDate', () => {
  it('should_prefix_with_today_when_lesson_is_today', () => {
    const now = new Date('2026-06-22T12:00:00Z')
    const iso = '2026-06-22T14:00:00Z'
    expect(formatLessonDate(iso, now)).toMatch(/^Today · /)
  })

  it('should_not_prefix_with_today_when_lesson_is_not_today', () => {
    const now = new Date('2026-06-22T12:00:00Z')
    const iso = '2026-05-19T10:00:00Z'
    expect(formatLessonDate(iso, now)).not.toMatch(/^Today/)
  })

  it('should_include_separator_between_date_and_time', () => {
    const now = new Date('2026-06-22T12:00:00Z')
    const iso = '2026-05-19T10:00:00Z'
    expect(formatLessonDate(iso, now)).toContain(' · ')
  })
})

describe('UpcomingLessonCard', () => {
  it('should_render_horse_names', () => {
    render(<UpcomingLessonCard lesson={makeLesson()} role="manager" slug="green-acres" />)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
  })

  it('should_show_instructor_name_for_rider_role', () => {
    render(<UpcomingLessonCard lesson={makeLesson()} role="rider" slug="green-acres" />)
    expect(screen.getByText('Jane Smith')).toBeDefined()
  })

  it('should_hide_instructor_name_for_manager_role', () => {
    render(<UpcomingLessonCard lesson={makeLesson()} role="manager" slug="green-acres" />)
    expect(screen.queryByText('Jane Smith')).toBeNull()
  })

  it('should_hide_instructor_name_for_trainer_role', () => {
    render(<UpcomingLessonCard lesson={makeLesson()} role="trainer" slug="green-acres" />)
    expect(screen.queryByText('Jane Smith')).toBeNull()
  })

  it('should_show_rider_names_for_manager_role', () => {
    render(<UpcomingLessonCard lesson={makeLesson()} role="manager" slug="green-acres" />)
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_show_rider_names_for_trainer_role', () => {
    render(<UpcomingLessonCard lesson={makeLesson()} role="trainer" slug="green-acres" />)
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_hide_rider_names_for_rider_role', () => {
    render(<UpcomingLessonCard lesson={makeLesson()} role="rider" slug="green-acres" />)
    expect(screen.queryByText('Alice')).toBeNull()
  })

  it('should_link_to_lesson_detail_page', () => {
    render(<UpcomingLessonCard lesson={makeLesson({ id: 'lesson-123' })} role="manager" slug="green-acres" />)
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/lessons/lesson-123')
  })
})
