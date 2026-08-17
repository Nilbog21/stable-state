import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { calendarDate } from '@/lib/local-day'
import { DashboardMonthCalendar } from '../DashboardMonthCalendar'
import type { DayScheduleDisplayItem } from '../dayScheduleItems'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

afterEach(() => {
  cleanup()
  push.mockReset()
})

const event = (id: string, title: string): DayScheduleDisplayItem => ({
  itemType: 'event',
  id,
  event: {
    id,
    barn_id: 'barn-1',
    title,
    event_at: { at: '2026-03-10T14:00:00Z', tz: 'America/New_York' },
    notes: null,
    visible_to_roles: ['manager', 'trainer', 'rider'],
    created_at: '',
  },
})

function renderCalendar(props: Partial<React.ComponentProps<typeof DashboardMonthCalendar>> = {}) {
  return render(
    <DashboardMonthCalendar
      slug="green-acres"
      month="2026-03"
      selectedDate={calendarDate('2026-03-10')}
      days={[
        { date: calendarDate('2026-03-10'), items: [event('e1', 'Barn meeting')] },
        { date: calendarDate('2026-03-11'), items: [] },
      ]}
      role="manager"
      viewerMembershipId="m1"
      {...props}
    />
  )
}

describe('DashboardMonthCalendar', () => {
  it('should_tint_a_day_that_has_something_scheduled', () => {
    renderCalendar()

    expect(screen.getByRole('button', { name: '2026-03-10' }).getAttribute('data-scheduled')).toBe('true')
  })

  it('should_not_tint_a_day_with_nothing_scheduled', () => {
    renderCalendar()

    expect(screen.getByRole('button', { name: '2026-03-11' }).getAttribute('data-scheduled')).toBe('false')
  })

  it('should_show_that_days_cards_when_a_day_is_tapped', () => {
    renderCalendar()
    fireEvent.click(screen.getByRole('button', { name: '2026-03-10' }))

    expect(screen.getByText('Barn meeting')).toBeDefined()
  })

  it('should_show_the_empty_state_for_a_day_with_nothing_on_it', () => {
    renderCalendar()
    fireEvent.click(screen.getByRole('button', { name: '2026-03-11' }))

    expect(screen.getByText("You're all clear")).toBeDefined()
  })

  // Selecting a day is pure client state — the whole month is already loaded, so opening the
  // panel must not cost a round trip.
  it('should_not_navigate_when_a_day_is_tapped', () => {
    renderCalendar()
    fireEvent.click(screen.getByRole('button', { name: '2026-03-10' }))

    expect(push).not.toHaveBeenCalled()
  })

  it('should_push_the_previous_month_when_the_back_arrow_is_tapped', () => {
    renderCalendar()
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))

    expect(push).toHaveBeenCalledWith('/barn/green-acres?view=month&date=2026-02-01', { scroll: false })
  })

  it('should_push_the_next_month_when_the_forward_arrow_is_tapped', () => {
    renderCalendar()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))

    expect(push).toHaveBeenCalledWith('/barn/green-acres?view=month&date=2026-04-01', { scroll: false })
  })

  it('should_render_the_rider_empty_state_subtext_for_a_rider', () => {
    renderCalendar({ role: 'rider' })
    fireEvent.click(screen.getByRole('button', { name: '2026-03-11' }))

    expect(screen.getByText('Nothing scheduled for this day.')).toBeDefined()
  })
})
