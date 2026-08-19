import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createMockBarnEvent, instant } from '@/test/fixtures'
import { EventForm } from '../EventForm'
import { withBlocker } from '@/test/navigation-blocker-harness'

afterEach(cleanup)

const mockAction = vi.fn().mockResolvedValue({ error: null })

function getScheduleRange() {
  return vi.fn().mockResolvedValue([])
}

describe('EventForm — navigation dirty state', () => {
  it('should_start_clean', () => {
    render(
      withBlocker(
        <EventForm timezone="America/New_York" mode="new" action={mockAction} getScheduleRange={getScheduleRange()} />
      )
    )
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  // The start-time field pushes its combined value up on mount; that programmatic push must not
  // flag a pristine edit form as dirty.
  it('should_start_clean_in_edit_mode', () => {
    render(
      withBlocker(
        <EventForm
          timezone="America/New_York"
          mode="edit"
          initialEvent={createMockBarnEvent({ event_at: instant('2026-07-01T22:30:00Z') })}
          action={mockAction}
          getScheduleRange={getScheduleRange()}
        />
      )
    )
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_set_dirty_when_title_changed', () => {
    render(
      withBlocker(
        <EventForm timezone="America/New_York" mode="new" action={mockAction} getScheduleRange={getScheduleRange()} />
      )
    )
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Costume Party' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  // A calendar day is a `<button>`, so tapping one fires no bubbling `change` for the form's
  // `onChange` to catch — the picker's own `onChange` has to arm the guard (#1645).
  it('should_set_dirty_when_a_day_is_tapped', () => {
    render(
      withBlocker(
        <EventForm
          timezone="America/New_York"
          mode="edit"
          initialEvent={createMockBarnEvent({ event_at: instant('2026-07-01T22:30:00Z') })}
          action={mockAction}
          getScheduleRange={getScheduleRange()}
        />
      )
    )
    fireEvent.click(screen.getByRole('button', { name: '2026-07-09' }))
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  it('should_set_dirty_when_the_start_time_changed', () => {
    render(
      withBlocker(
        <EventForm timezone="America/New_York" mode="new" action={mockAction} getScheduleRange={getScheduleRange()} />
      )
    )
    fireEvent.change(screen.getByLabelText('Start Time'), { target: { value: '18:30' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
