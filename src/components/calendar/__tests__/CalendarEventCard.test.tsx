import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CalendarEventCard, formatEventDate } from '../CalendarEventCard'
import { createMockBarnEvent } from '@/test/fixtures'

describe('formatEventDate', () => {
  it('should_prefix_with_today_when_event_is_today', () => {
    const now = new Date('2026-07-09T12:00:00Z')
    expect(formatEventDate('2026-07-09T14:00:00Z', now)).toMatch(/^Today · /)
  })

  it('should_not_prefix_with_today_when_event_is_not_today', () => {
    const now = new Date('2026-07-09T12:00:00Z')
    expect(formatEventDate('2026-07-11T14:00:00Z', now)).not.toMatch(/^Today/)
  })
})

describe('CalendarEventCard', () => {
  it('should_render_formatted_date_and_time', () => {
    render(<CalendarEventCard event={createMockBarnEvent({ event_at: '2026-07-15T14:00:00Z' })} />)
    expect(screen.getByText(/ · /)).toBeDefined()
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
