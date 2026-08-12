import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { instantToLocalWallClock } from '@/lib/barn-timezone'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { createMockLessonTier, createMockHorse, createMockScheduleItem } from '@/test/fixtures'
import { LessonForm } from '../LessonForm'
import { calendarDate } from '@/lib/local-day'

afterEach(cleanup)

const sampleTier = createMockLessonTier({ is_default: true })

const baseProps = {
  mode: 'new' as const,
  horses: [],
  riders: [],
  isManager: false,
  action: vi.fn().mockResolvedValue({ error: null }),
  instructors: [],
  currentMembershipId: 'user-1',
  tiers: [sampleTier],
  todayStr: calendarDate('2026-06-01'),
}

describe('LessonForm exhaustion bars', () => {
  const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
  const horse2 = createMockHorse({ id: 'h2', name: 'Shadow', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
  const thresholds = { high: 11, moderate: 5 }

  it('should_not_render_exhaustion_bar_before_getProjectedExhaustion_resolves', () => {
    const getProjectedExhaustion = vi.fn().mockImplementation(() => new Promise(() => {}))
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).toBeNull()
  })

  it('should_render_exhaustion_bar_for_each_horse_after_fetch_resolves', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      h1: { existingRows: [], thresholds },
    })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).not.toBeNull()
    })
  })

  it('should_render_solid_bars_for_both_horses_before_any_are_checked', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      h1: { existingRows: [], thresholds },
      h2: { existingRows: [], thresholds },
    })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse, horse2]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-testid="exhaustion-bar-solid"]')).toHaveLength(2)
    })
  })

  it('should_render_ghost_bar_only_for_the_checked_horse', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      h1: { existingRows: [], thresholds },
      h2: { existingRows: [], thresholds },
    })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse, horse2]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-testid="exhaustion-bar-solid"]')).toHaveLength(2)
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    expect(document.querySelectorAll('[data-testid="exhaustion-bar-ghost"]')).toHaveLength(1)
  })

  it('should_refetch_when_date_changes', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({})
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledTimes(1))
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-06-15' } })
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledTimes(2))
  })

  it('should_call_getProjectedExhaustion_with_the_new_date_after_a_date_change', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({})
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledTimes(1))
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-06-15' } })
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledTimes(2))
    // The received value is a UTC instant now, not a raw '2026-06-15...' string —
    // decode it back to the local calendar date it represents instead of substring matching.
    const receivedIso = getProjectedExhaustion.mock.calls[1][0] as string
    const barnDate = instantToLocalWallClock(new Date(receivedIso), 'America/New_York').slice(0, 10)
    expect(barnDate).toBe('2026-06-15')
  })

  it('should_call_getProjectedExhaustion_with_the_ids_of_every_horse_passed_in_props', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({})
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse, horse2]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalled())
    expect(getProjectedExhaustion.mock.calls[0][1]).toEqual(['h1', 'h2'])
  })

  it('should_not_show_stale_exhaustion_data_after_a_date_change_before_the_refetch_resolves', async () => {
    let resolveSecondFetch: (value: Record<string, unknown>) => void = () => {}
    const getProjectedExhaustion = vi.fn()
      .mockResolvedValueOnce({ h1: { existingRows: [], thresholds } })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecondFetch = resolve }))
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).not.toBeNull()
    })

    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-06-15' } })
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledTimes(2))

    expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).toBeNull()

    await act(async () => { resolveSecondFetch({ h1: { existingRows: [], thresholds } }) })
  })

  it('should_not_render_exhaustion_bar_when_getProjectedExhaustion_is_omitted', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} />)
    expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).toBeNull()
  })

  it('should_not_render_exhaustion_bar_when_date_changed_to_the_past', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      h1: { existingRows: [], thresholds },
    })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).not.toBeNull()
    })
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2020-01-01' } })
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).toBeNull()
    })
  })
})

// #1019 — the date field becomes a month conflict calendar when the form is given a
// schedule reader; without one it stays a plain native date input. Since #1021 that fallback is
// LessonForm's own inline `#lesson-date` input, not DateHourPicker's — the lesson form no longer
// uses that component at all.
describe('LessonForm — month conflict calendar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T14:30:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const thunder = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })

  async function renderWithCalendar(items: ReturnType<typeof createMockScheduleItem>[] = [], props = {}) {
    const getScheduleRange = vi.fn().mockResolvedValue(items)
    const result = render(
      <LessonForm timezone={'America/New_York'} {...baseProps} horses={[thunder]} riders={[{ id: 'r1', name: 'Alice' }]} getScheduleRange={getScheduleRange} {...props} />
    )
    await act(async () => { await Promise.resolve() })
    return { ...result, getScheduleRange }
  }

  // #1149 -- todayStr is the barn's own day, computed server-side. A barn a day ahead of the
  // viewer greys out the viewer's own day, since it is already past in barn time.
  it('should_grey_out_the_viewers_own_day_when_the_barn_is_already_a_day_ahead', async () => {
    await renderWithCalendar([], { todayStr: calendarDate('2026-06-02') })

    expect(screen.getByRole('button', { name: '2026-06-01' }).getAttribute('data-past')).toBe('true')
  })

  it('should_replace_the_native_date_input_with_the_month_calendar', async () => {
    const { container } = await renderWithCalendar()

    expect(container.querySelector('input[type="date"]')).toBeNull()
  })

  it('should_widen_the_fetched_range_by_the_exertion_window_at_both_ends', async () => {
    const { getScheduleRange } = await renderWithCalendar()

    expect(getScheduleRange).toHaveBeenCalledWith('2026-05-28', '2026-07-15')
  })

  it('should_describe_a_lesson_by_the_names_its_participant_ids_resolve_to', async () => {
    await renderWithCalendar([createMockScheduleItem({ id: 'l1', start: '2026-06-10T14:00:00', horseIds: ['h1'], riderIds: ['r1'] })])

    fireEvent.click(screen.getByRole('button', { name: '2026-06-10' }))

    expect(screen.getByText('Lesson — Thunder, Alice')).toBeDefined()
  })

  it('should_fall_back_to_a_bare_lesson_label_when_no_participant_id_resolves', async () => {
    await renderWithCalendar([createMockScheduleItem({ id: 'l1', start: '2026-06-10T14:00:00', horseIds: ['gone'] })])

    fireEvent.click(screen.getByRole('button', { name: '2026-06-10' }))

    expect(screen.getByText('Lesson')).toBeDefined()
  })

  it('should_use_the_server_supplied_label_for_an_expense', async () => {
    await renderWithCalendar([
      createMockScheduleItem({ id: 'e1', itemType: 'expense', start: '2026-06-10T14:00:00', label: 'Veterinary — Dr. Smith' }),
    ])

    fireEvent.click(screen.getByRole('button', { name: '2026-06-10' }))

    expect(screen.getByText('Veterinary — Dr. Smith')).toBeDefined()
  })

  it('should_title_the_calendar_field_Date_for_a_one_off_lesson', async () => {
    await renderWithCalendar()

    expect(screen.getByText('Date')).toBeDefined()
  })

  it('should_title_the_calendar_field_Starting_Date_once_recurring_is_checked', async () => {
    await renderWithCalendar()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Recurring (weekly)' }))

    expect(screen.getByText('Starting Date')).toBeDefined()
  })
})
