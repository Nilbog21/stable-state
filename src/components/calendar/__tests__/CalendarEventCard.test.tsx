import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CalendarEventCard } from '../CalendarEventCard'
import { createMockBarnEvent, instant } from '@/test/fixtures'

describe('CalendarEventCard', () => {
  // See CalendarLessonCard.test.tsx — 14:00Z is 10:00 barn-local, 19:30 host-local.
  it('should_render_the_time_in_the_barns_timezone', () => {
    render(<CalendarEventCard event={createMockBarnEvent({ event_at: instant('2026-07-15T14:00:00Z') })} />)
    expect(screen.getByText('10:00 AM')).toBeDefined()
  })

  it('should_render_title', () => {
    render(<CalendarEventCard event={createMockBarnEvent({ title: 'Costume Party' })} />)
    expect(screen.getByText('Costume Party')).toBeDefined()
  })

  it('should_render_notes_when_present', () => {
    render(<CalendarEventCard event={createMockBarnEvent({ notes: 'Bring your own hay' })} />)
    expect(screen.getByText('Bring your own hay')).toBeDefined()
  })

  it('should_not_render_notes_paragraph_when_notes_is_null', () => {
    render(<CalendarEventCard event={createMockBarnEvent({ notes: null, title: 'Costume Party' })} />)
    expect(screen.queryByText('null')).toBeNull()
  })

  it('should_not_render_as_a_link', () => {
    render(<CalendarEventCard event={createMockBarnEvent()} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
