import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('../DeleteLessonButton', () => ({
  DeleteLessonButton: ({ action }: { action: () => void }) => (
    <button type="button" onClick={action}>Delete</button>
  ),
}))

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
  horse_names: ['Comet'],
  rider_name: 'Bob',
}

const mockDeleteAction = vi.fn()

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
        deleteAction={mockDeleteAction}
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
        deleteAction={mockDeleteAction}
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
        deleteAction={mockDeleteAction}
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
        deleteAction={mockDeleteAction}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show older lessons/i }))
    expect(screen.getByText('Comet')).toBeDefined()
  })

  it('should_show_hide_older_lessons_button_label_after_expanding', () => {
    render(
      <OlderLessonsToggle
        lessons={[mockLesson]}
        slug="green-acres"
        isManager={false}
        deleteAction={mockDeleteAction}
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
        deleteAction={mockDeleteAction}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show older lessons/i }))
    fireEvent.click(screen.getByRole('button', { name: /hide older lessons/i }))
    expect(screen.queryByText('Comet')).toBeNull()
  })

  it('should_display_rider_name_in_older_lessons', () => {
    render(
      <OlderLessonsToggle
        lessons={[mockLesson]}
        slug="green-acres"
        isManager={false}
        deleteAction={mockDeleteAction}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show older lessons/i }))
    expect(screen.getByText('Bob')).toBeDefined()
  })

  it('should_not_show_delete_button_when_not_manager', () => {
    render(
      <OlderLessonsToggle
        lessons={[mockLesson]}
        slug="green-acres"
        isManager={false}
        deleteAction={mockDeleteAction}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show older lessons/i }))
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('should_show_delete_button_for_manager', () => {
    render(
      <OlderLessonsToggle
        lessons={[mockLesson]}
        slug="green-acres"
        isManager={true}
        deleteAction={mockDeleteAction}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show older lessons/i }))
    expect(screen.getByRole('button', { name: /delete/i })).toBeDefined()
  })
})
