import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import type { LessonDetail, Horse } from '@/lib/db/types'
import { createMockHorse, createMockLessonDetail, createMockLessonTier, instant } from '@/test/fixtures'
import { LessonForm } from '../LessonForm'
import { calendarDate } from '@/lib/local-day'

afterEach(cleanup)

const mockTier = createMockLessonTier({ is_default: true })

const mockHorse: Horse = createMockHorse()
const mockRider = { id: 'rider-1', name: 'Alice' }
const mockRider2 = { id: 'rider-2', name: 'Bob' }

// 10:30Z — 06:30 in the fixture barn's America/New_York. Deliberately *not* a whole hour: this
// fixture was pinned to 10:00Z only because the old hour-only picker could not represent
// anything else and silently rewrote the minutes away. #1021 restored the half hour, so every
// edit-mode test below now exercises the minute-granular round trip rather than dodging it.
const normalLesson: LessonDetail = createMockLessonDetail({
  instructor_id: 'user-1',
  fee: 75,
  lesson_at: instant('2026-05-17T10:30:00Z'),
  submitted_at: '2026-05-17T10:35:00Z',
  lesson_riders: [{ rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: null } }],
})

const baseProps = {
  mode: 'edit' as const,
  initialLesson: normalLesson,
  horses: [mockHorse],
  riders: [mockRider, mockRider2],
  instructors: [{ membershipId: 'user-1', userId: 'user-1', name: 'Jane Smith' }],
  currentMembershipId: 'user-1',
  isManager: true,
  tiers: [mockTier],
  action: vi.fn().mockResolvedValue({ error: null }),
  todayStr: calendarDate('2026-06-01'),
}

const pastLesson: LessonDetail = {
  ...normalLesson,
  lesson_at: instant('2020-01-01T10:00:00Z'),
  payment_type: null,
  fee: 75,
}

describe('LessonForm (edit mode) exhaustion bars', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should_fetch_projected_exhaustion_using_the_prefilled_lesson_date_on_mount', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({})
    render(<LessonForm timezone={'America/New_York'} {...baseProps} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledWith('2026-05-17T10:30:00.000Z', ['horse-1']))
  })

  it('should_render_exhaustion_bar_for_the_pre_checked_horse', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      'horse-1': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
    })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).not.toBeNull()
    })
  })

  it('should_call_getProjectedExhaustion_with_the_id_of_an_inactive_assigned_horse_too', async () => {
    const inactiveHorse = createMockHorse({ id: 'horse-2', name: 'Retired (inactive)', is_active: false })
    const getProjectedExhaustion = vi.fn().mockResolvedValue({})
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[mockHorse, inactiveHorse]} getProjectedExhaustion={getProjectedExhaustion} />)
    // Round-tripping initialLesson.lesson_at through the (local-aware) date/hour
    // picker and back into a UTC instant reproduces the same instant exactly.
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledWith('2026-05-17T10:30:00.000Z', ['horse-1', 'horse-2']))
  })

  it('should_not_render_an_exhaustion_bar_for_an_inactive_assigned_horse', async () => {
    const inactiveHorse = createMockHorse({ id: 'horse-2', name: 'Retired (inactive)', is_active: false })
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      'horse-1': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
      'horse-2': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
    })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[mockHorse, inactiveHorse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-testid="exhaustion-bar-solid"]')).toHaveLength(1)
    })
  })

  it('should_not_render_an_exhaustion_bar_for_an_unavailable_horse', async () => {
    const unavailableHorse = createMockHorse({ id: 'horse-2', name: 'Blaze', is_available: false })
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      'horse-1': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
      'horse-2': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
    })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[mockHorse, unavailableHorse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-testid="exhaustion-bar-solid"]')).toHaveLength(1)
    })
  })

  it('should_not_render_exhaustion_bar_when_lesson_date_is_in_the_past', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      'horse-1': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
    })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={pastLesson} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalled())
    expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).toBeNull()
  })

  it('should_sort_checked_horse_before_available_horse_regardless_of_exhaustion', async () => {
    const availableHorse = createMockHorse({ id: 'horse-avail', name: 'Zeal' })
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      'horse-1': { existingRows: [{ lessonAt: 'x', exertionLevel: 5 }], thresholds: { high: 11, moderate: 5 } },
      'horse-avail': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
    })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[availableHorse, mockHorse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalled())
    await waitFor(() => {
      const checkboxes = container.querySelectorAll('input[type="checkbox"][name="horse_id"]')
      expect((checkboxes[0] as HTMLInputElement).value).toBe('horse-1')
    })
  })

  it('should_sort_available_horses_least_to_most_exhausted', async () => {
    const lessExhausted = createMockHorse({ id: 'horse-low', name: 'Low' })
    const moreExhausted = createMockHorse({ id: 'horse-high', name: 'High' })
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      'horse-high': { existingRows: [{ lessonAt: 'x', exertionLevel: 5 }], thresholds: { high: 11, moderate: 5 } },
      'horse-low': { existingRows: [{ lessonAt: 'x', exertionLevel: 1 }], thresholds: { high: 11, moderate: 5 } },
    })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[moreExhausted, lessExhausted]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalled())
    await waitFor(() => {
      const checkboxes = container.querySelectorAll('input[type="checkbox"][name="horse_id"]')
      expect((checkboxes[0] as HTMLInputElement).value).toBe('horse-low')
    })
  })

  it('should_sort_an_unchecked_inactive_horse_after_an_available_horse', async () => {
    const availableHorse = createMockHorse({ id: 'horse-avail', name: 'Zeal' })
    const inactiveHorse = createMockHorse({ id: 'horse-inactive', name: 'Retired', is_active: false })
    const getProjectedExhaustion = vi.fn().mockResolvedValue({})
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[inactiveHorse, availableHorse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalled())
    await waitFor(() => {
      const checkboxes = container.querySelectorAll('input[type="checkbox"][name="horse_id"]')
      expect((checkboxes[checkboxes.length - 1] as HTMLInputElement).value).toBe('horse-inactive')
    })
  })

  it('should_render_an_exhaustion_bar_for_an_inactive_horse_still_checked_on_this_lesson', async () => {
    const inactiveHorse = createMockHorse({ id: 'horse-2', name: 'Retired (inactive)', is_active: false })
    const lesson = { ...normalLesson, lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-2', name: 'Retired (inactive)' } }] }
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      'horse-2': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
    })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={lesson} horses={[inactiveHorse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).not.toBeNull()
    })
  })
})

describe('LessonForm (edit mode) — timezone-aware date/hour prefill', () => {
  // 02:00 UTC on 2026-05-17 is 22:00 EDT (UTC-4) on the *previous* local day —
  // the case naive string-slicing gets wrong.
  const lessonNearUtcMidnight: LessonDetail = { ...normalLesson, lesson_at: instant('2026-05-17T02:00:00Z') }

  it('should_prefill_the_date_picker_with_the_local_calendar_date_not_the_utc_date', () => {
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={lessonNearUtcMidnight} />)
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    expect(dateInput.value).toBe('2026-05-16')
  })

  it('should_prefill_the_start_time_with_the_local_hour_not_the_utc_hour', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={lessonNearUtcMidnight} />)
    expect((screen.getByLabelText('Start Time') as HTMLInputElement).value).toBe('22:00')
  })

  // #1021 — the regression this issue closes: the hour-only picker seeded itself from the hour
  // alone and recombined at :00, so saving an untouched edit form moved a 4:30 lesson to 4:00.
  it('should_prefill_the_start_time_without_truncating_the_minutes', () => {
    const halfPast: LessonDetail = { ...normalLesson, lesson_at: instant('2026-05-17T20:45:00Z') }

    render(<LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={halfPast} />)

    expect((screen.getByLabelText('Start Time') as HTMLInputElement).value).toBe('16:45')
  })

  it('should_round_trip_a_non_whole_hour_lesson_at_back_to_the_same_instant', () => {
    const halfPast: LessonDetail = { ...normalLesson, lesson_at: instant('2026-05-17T20:45:00Z') }

    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={halfPast} />)

    expect((container.querySelector('input[name="lesson_at"]') as HTMLInputElement).value).toBe('2026-05-17T20:45:00.000Z')
  })
})
