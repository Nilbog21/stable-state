import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LessonListItem } from '../LessonListItem'

afterEach(cleanup)

const baseLesson = {
  id: 'lesson-1',
  barn_id: 'barn-1',
  instructor_id: 'user-1',
  fee: 75,
  lesson_at: '2026-05-17T10:00:00Z',
  submitted_at: '2026-05-17T10:05:00Z',
  instructor_name: 'Jane Smith',
  jumping: false as const,
  payment_type: null,
  tier_name: 'Custom',
}

const normalLesson = {
  ...baseLesson,
  lesson_type: 'normal' as const,
  horse_names: ['Thunderbolt'],
  horse_count: 1,
  rider_names: ['Alice'],
  rider_count: 1,
}

const groupLesson = {
  ...baseLesson,
  lesson_type: 'group' as const,
  horse_names: ['Thunderbolt', 'Shadow'],
  horse_count: 2,
  rider_names: ['Alice', 'Bob', 'Carol'],
  rider_count: 3,
}

const deleteAction = async () => {}

describe('LessonListItem', () => {
  it('should_show_horse_name_for_normal_lesson', () => {
    render(<LessonListItem lesson={normalLesson} slug="green-acres" isManager={false} deleteAction={deleteAction} />)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
  })

  it('should_show_rider_name_for_normal_lesson', () => {
    render(<LessonListItem lesson={normalLesson} slug="green-acres" isManager={false} deleteAction={deleteAction} />)
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_show_counts_for_group_lesson', () => {
    render(<LessonListItem lesson={groupLesson} slug="green-acres" isManager={false} deleteAction={deleteAction} />)
    expect(screen.getByText('3 riders, 2 horses')).toBeDefined()
  })

  it('should_not_show_horse_name_when_horse_names_empty_and_normal', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, horse_names: [], horse_count: 0 }}
        slug="green-acres"
        isManager={false}
        deleteAction={deleteAction}
      />
    )
    expect(screen.queryByText('Thunderbolt')).toBeNull()
  })

  it('should_not_show_rider_name_when_rider_names_empty_and_normal', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, rider_names: [], rider_count: 0 }}
        slug="green-acres"
        isManager={false}
        deleteAction={deleteAction}
      />
    )
    expect(screen.queryByText('Alice')).toBeNull()
  })

  it('should_show_tier_name_alongside_fee', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, fee: 75, tier_name: 'Premium' }}
        slug="green-acres"
        isManager={false}
        deleteAction={deleteAction}
      />
    )
    expect(screen.getByText('$75 · Premium')).toBeDefined()
  })

  it('should_show_custom_tier_name_when_fee_is_null', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, fee: null, tier_name: 'Custom' }}
        slug="green-acres"
        isManager={false}
        deleteAction={deleteAction}
      />
    )
    expect(screen.getByText('Custom')).toBeDefined()
  })

  it('should_show_tier_name_when_fee_is_null', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, fee: null, tier_name: 'Group Rate' }}
        slug="green-acres"
        isManager={false}
        deleteAction={deleteAction}
      />
    )
    expect(screen.getByText('Group Rate')).toBeDefined()
  })

  it('should_show_jumping_after_horse_name_for_jumping_normal_lesson', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, jumping: true }}
        slug="green-acres"
        isManager={false}
        deleteAction={deleteAction}
      />
    )
    expect(screen.getByText('Thunderbolt · Jumping')).toBeDefined()
  })

  it('should_not_show_jumping_for_non_jumping_normal_lesson', () => {
    render(
      <LessonListItem
        lesson={normalLesson}
        slug="green-acres"
        isManager={false}
        deleteAction={deleteAction}
      />
    )
    expect(screen.queryByText(/Jumping/)).toBeNull()
  })

  it('should_show_jumping_after_counts_for_jumping_group_lesson', () => {
    render(
      <LessonListItem
        lesson={{ ...groupLesson, jumping: true }}
        slug="green-acres"
        isManager={false}
        deleteAction={deleteAction}
      />
    )
    expect(screen.getByText('3 riders, 2 horses · Jumping')).toBeDefined()
  })

  it('should_not_show_jumping_for_non_jumping_group_lesson', () => {
    render(
      <LessonListItem
        lesson={groupLesson}
        slug="green-acres"
        isManager={false}
        deleteAction={deleteAction}
      />
    )
    expect(screen.queryByText(/Jumping/)).toBeNull()
  })
})
