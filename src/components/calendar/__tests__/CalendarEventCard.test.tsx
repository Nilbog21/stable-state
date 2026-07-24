import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CalendarEventCard, formatEventTime } from '../CalendarEventCard'
import { createMockBarnEvent } from '@/test/fixtures'

describe('formatEventTime', () => {
  it('should_format_the_event_start_time', () => {
    const iso = '2026-07-09T14:00:00Z'
    expect(formatEventTime(iso)).toBe(new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
  })
})

describe('CalendarEventCard', () => {
  it('should_render_formatted_time', () => {
    const iso = '2026-07-15T14:00:00Z'
    render(<CalendarEventCard event={createMockBarnEvent({ event_at: iso })} />)
    expect(screen.getByText(formatEventTime(iso))).toBeDefined()
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
