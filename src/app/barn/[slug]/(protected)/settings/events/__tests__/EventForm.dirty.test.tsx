import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createMockBarnEvent } from '@/test/fixtures'
import { EventForm } from '../EventForm'
import { withBlocker } from '@/test/navigation-blocker-harness'

afterEach(cleanup)

const mockAction = vi.fn().mockResolvedValue({ error: null })

describe('EventForm — navigation dirty state', () => {
  it('should_start_clean', () => {
    render(withBlocker(<EventForm timezone={'America/New_York'} mode="new" action={mockAction} />))
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  // DateHourPicker pushes its combined value up through onChange from a mount-time effect;
  // that programmatic push must not arm the guard on a pristine edit form.
  it('should_start_clean_in_edit_mode', () => {
    render(
      withBlocker(
        <EventForm timezone={'America/New_York'} mode="edit" initialEvent={createMockBarnEvent()} action={mockAction} />
      )
    )
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_set_dirty_when_title_changed', () => {
    render(withBlocker(<EventForm timezone={'America/New_York'} mode="new" action={mockAction} />))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Costume Party' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  it('should_set_dirty_when_date_picked', () => {
    render(withBlocker(<EventForm timezone={'America/New_York'} mode="new" action={mockAction} />))
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: '2026-07-10' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
