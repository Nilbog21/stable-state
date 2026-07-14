import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LessonListItem } from '../LessonListItem'
import { createMockLessonWithDetails } from '@/test/fixtures'

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
  cancelled_at: null,
  cancellation_notes: null,
  series_id: null,
}

const normalLesson = createMockLessonWithDetails({
  ...baseLesson,
  lesson_type: 'normal' as const,
  horse_names: ['Thunderbolt'],
  horse_count: 1,
  rider_names: ['Alice'],
  rider_count: 1,
})

const groupLesson = createMockLessonWithDetails({
  ...baseLesson,
  lesson_type: 'group' as const,
  horse_names: ['Thunderbolt', 'Shadow'],
  horse_count: 2,
  rider_names: ['Alice', 'Bob', 'Carol'],
  rider_count: 3,
})

describe('LessonListItem', () => {
  it('should_show_horse_name_for_normal_lesson', () => {
    render(<LessonListItem lesson={normalLesson} slug="green-acres" isManager={false} isTrainer={false} currentMembershipId="user-1" />)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
  })

  it('should_show_rider_name_for_normal_lesson_to_manager', () => {
    render(<LessonListItem lesson={normalLesson} slug="green-acres" isManager={true} isTrainer={false} currentMembershipId="user-1" />)
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_not_show_rider_name_for_rider_role_even_when_present', () => {
    render(<LessonListItem lesson={normalLesson} slug="green-acres" isManager={false} isTrainer={false} currentMembershipId="user-1" />)
    expect(screen.queryByText('Alice')).toBeNull()
  })

  it('should_show_counts_for_group_lesson', () => {
    render(<LessonListItem lesson={groupLesson} slug="green-acres" isManager={false} isTrainer={false} currentMembershipId="user-1" />)
    expect(screen.getByText('3 riders, 2 horses')).toBeDefined()
  })

  it('should_not_show_horse_name_when_horse_names_empty_and_normal', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, horse_names: [], horse_count: 0 }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByText('Thunderbolt')).toBeNull()
  })

  it('should_not_show_rider_name_when_rider_names_empty_and_normal_for_manager', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, rider_names: [], rider_count: 0 }}
        slug="green-acres"
        isManager={true}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByText('Alice')).toBeNull()
  })

  it('should_show_recurring_badge_when_series_id_set', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, series_id: 'series-1' }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.getByText('Recurring')).toBeDefined()
  })

  it('should_not_show_recurring_badge_when_series_id_null', () => {
    render(<LessonListItem lesson={normalLesson} slug="green-acres" isManager={false} isTrainer={false} currentMembershipId="user-1" />)
    expect(screen.queryByText('Recurring')).toBeNull()
  })

  it('should_show_tier_name_alongside_fee', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, fee: 75, tier_name: 'Premium' }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.getByText('$75 · Premium')).toBeDefined()
  })

  it('should_show_jumping_after_horse_name_for_jumping_normal_lesson', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, jumping: true }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
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
        isTrainer={false}
        currentMembershipId="user-1"
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
        isTrainer={false}
        currentMembershipId="user-1"
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
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByText(/Jumping/)).toBeNull()
  })

  it('should_show_unpaid_badge_when_past_lesson_with_fee_and_no_payment', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2026-05-17T10:00:00Z', fee: 75, payment_type: null }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.getByText('Unpaid')).toBeDefined()
  })

  it('should_not_show_unpaid_badge_when_fee_is_zero', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2026-05-17T10:00:00Z', fee: 0, payment_type: null }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByText('Unpaid')).toBeNull()
  })

  it('should_not_show_unpaid_badge_when_payment_type_is_set', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2026-05-17T10:00:00Z', fee: 75, payment_type: 'cash' }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByText('Unpaid')).toBeNull()
  })

  it('should_not_show_unpaid_badge_when_lesson_is_in_future', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2099-01-01T10:00:00Z', fee: 75, payment_type: null }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByText('Unpaid')).toBeNull()
  })

  it('should_show_cancelled_badge_when_cancelled_at_is_set', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, cancelled_at: '2026-01-01T00:00:00Z' }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.getByText('Cancelled')).toBeDefined()
  })

  it('should_not_show_cancelled_badge_when_cancelled_at_is_null', () => {
    render(
      <LessonListItem
        lesson={normalLesson}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByText('Cancelled')).toBeNull()
  })

  it('should_not_show_unpaid_badge_when_lesson_is_cancelled', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2026-05-17T10:00:00Z', fee: 0, payment_type: null, cancelled_at: '2026-01-01T00:00:00Z' }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByText('Unpaid')).toBeNull()
  })

  it('should_show_cancel_link_for_manager_on_eligible_future_lesson', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2099-01-01T10:00:00Z' }}
        slug="green-acres"
        isManager={true}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.getByRole('link', { name: 'Cancel' })).toBeDefined()
  })

  it('should_show_cancel_link_for_manager_on_eligible_unpaid_past_lesson', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2026-01-01T10:00:00Z', payment_type: null }}
        slug="green-acres"
        isManager={true}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.getByRole('link', { name: 'Cancel' })).toBeDefined()
  })

  it('should_not_show_cancel_link_when_already_cancelled', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2099-01-01T10:00:00Z', cancelled_at: '2026-01-01T00:00:00Z' }}
        slug="green-acres"
        isManager={true}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByRole('link', { name: 'Cancel' })).toBeNull()
  })

  it('should_not_show_cancel_link_when_past_and_paid', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2026-01-01T10:00:00Z', payment_type: 'cash' }}
        slug="green-acres"
        isManager={true}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByRole('link', { name: 'Cancel' })).toBeNull()
  })

  it('should_show_cancel_link_for_trainer_who_is_the_instructor', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, instructor_id: 'user-1', lesson_at: '2099-01-01T10:00:00Z' }}
        slug="green-acres"
        isManager={false}
        isTrainer={true}
        currentMembershipId="user-1"
      />
    )
    expect(screen.getByRole('link', { name: 'Cancel' })).toBeDefined()
  })

  it('should_not_show_cancel_link_for_trainer_who_is_not_the_instructor', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, instructor_id: 'other-trainer', lesson_at: '2099-01-01T10:00:00Z' }}
        slug="green-acres"
        isManager={false}
        isTrainer={true}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByRole('link', { name: 'Cancel' })).toBeNull()
  })

  it('should_not_show_cancel_link_for_rider', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2099-01-01T10:00:00Z' }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByRole('link', { name: 'Cancel' })).toBeNull()
  })

  it('should_link_cancel_button_to_cancel_route', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2099-01-01T10:00:00Z' }}
        slug="green-acres"
        isManager={true}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/barn/green-acres/lessons/lesson-1/cancel')
  })

  it('should_show_cancel_button_for_rider_when_own_participation_not_cancelled', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2099-01-01T10:00:00Z', rider_ids: ['viewer-mem-1'], rider_cancelled_ats: [null] }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
        viewerMembershipId="viewer-mem-1"
      />
    )
    expect(screen.getByRole('link', { name: 'Cancel' })).toBeDefined()
  })

  it('should_show_cancel_button_for_rider_on_eligible_unpaid_past_lesson', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2026-01-01T10:00:00Z', payment_type: null, rider_ids: ['viewer-mem-1'], rider_cancelled_ats: [null] }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
        viewerMembershipId="viewer-mem-1"
      />
    )
    expect(screen.getByRole('link', { name: 'Cancel' })).toBeDefined()
  })

  it('should_link_rider_cancel_button_to_cancel_rider_route_with_viewer_membership_id', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2099-01-01T10:00:00Z', rider_ids: ['viewer-mem-1'], rider_cancelled_ats: [null] }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
        viewerMembershipId="viewer-mem-1"
      />
    )
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/barn/green-acres/lessons/lesson-1/cancel-rider/viewer-mem-1')
  })

  it('should_not_show_cancel_button_for_rider_when_own_participation_already_cancelled', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2099-01-01T10:00:00Z', rider_ids: ['viewer-mem-1'], rider_cancelled_ats: ['2026-01-01T00:00:00Z'] }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
        viewerMembershipId="viewer-mem-1"
      />
    )
    expect(screen.queryByRole('link', { name: 'Cancel' })).toBeNull()
  })

  it('should_not_show_cancel_button_for_rider_when_whole_lesson_cancelled', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2099-01-01T10:00:00Z', cancelled_at: '2026-01-01T00:00:00Z', rider_ids: ['viewer-mem-1'], rider_cancelled_ats: [null] }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
        viewerMembershipId="viewer-mem-1"
      />
    )
    expect(screen.queryByRole('link', { name: 'Cancel' })).toBeNull()
  })

  it('should_show_cancelled_badge_for_rider_own_cancelled_participation', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2099-01-01T10:00:00Z', rider_ids: ['viewer-mem-1'], rider_cancelled_ats: ['2026-01-01T00:00:00Z'] }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
        viewerMembershipId="viewer-mem-1"
      />
    )
    expect(screen.getByText('Cancelled')).toBeDefined()
  })

  it('should_not_show_participation_badge_for_rider_when_not_enrolled_in_lesson', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2099-01-01T10:00:00Z', rider_ids: ['other-mem-1'], rider_cancelled_ats: ['2026-01-01T00:00:00Z'] }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
        viewerMembershipId="viewer-mem-1"
      />
    )
    expect(screen.queryByText('Cancelled')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Cancel' })).toBeNull()
  })

  it('should_show_needs_attention_badge_when_future_uncancelled_lesson_needs_attention', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2099-01-01T10:00:00Z', needs_attention: true }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.getByText('Needs Attention')).toBeDefined()
  })

  it('should_not_show_needs_attention_badge_when_lesson_is_in_the_past', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2026-01-01T10:00:00Z', needs_attention: true }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByText('Needs Attention')).toBeNull()
  })

  it('should_not_show_needs_attention_badge_when_lesson_is_cancelled', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2099-01-01T10:00:00Z', needs_attention: true, cancelled_at: '2026-01-01T00:00:00Z' }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByText('Needs Attention')).toBeNull()
  })

  it('should_not_show_needs_attention_badge_when_needs_attention_is_false', () => {
    render(
      <LessonListItem
        lesson={{ ...normalLesson, lesson_at: '2099-01-01T10:00:00Z', needs_attention: false }}
        slug="green-acres"
        isManager={false}
        isTrainer={false}
        currentMembershipId="user-1"
      />
    )
    expect(screen.queryByText('Needs Attention')).toBeNull()
  })

  it('should_render_lesson_row_as_single_link_to_detail_page', () => {
    render(<LessonListItem lesson={normalLesson} slug="green-acres" isManager={true} isTrainer={false} currentMembershipId="user-1" />)
    const link = screen.getByRole('link', { name: /thunderbolt/i })
    expect(link.getAttribute('href')).toBe('/barn/green-acres/lessons/lesson-1')
  })
})
