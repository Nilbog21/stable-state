import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockBarnEvent } from '@/test/fixtures'
import { guardAs } from '@/test/mocks/guard'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/barn-events', () => ({ getEventById: vi.fn() }))
vi.mock('@/app/actions/lessons', () => ({ getScheduleRangeForBarn: vi.fn() }))
vi.mock('../../../actions', () => ({
  updateEventAction: vi.fn(),
}))
vi.mock('../../EventForm', () => ({
  EventForm: ({
    mode,
    timezone,
    initialEvent,
    getScheduleRange,
  }: {
    mode: string
    timezone: string
    initialEvent?: { title: string }
    getScheduleRange: unknown
  }) => (
    <div
      data-testid="event-form"
      data-mode={mode}
      data-timezone={timezone}
      data-event-title={initialEvent?.title}
      data-has-schedule-range={typeof getScheduleRange === 'function'}
    >
      EventForm
    </div>
  ),
}))

const mockNotFound = vi.hoisted(() =>
  vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
)
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))

import { requireMembership } from '@/lib/auth/guard'
import { getEventById } from '@/lib/db/barn-events'
import EventEditPage from '../page'

const mockBarn = createMockBarn({ timezone: 'America/Denver' })
const managerMembership = createMockMembership({ role: 'manager', status: 'active' })
const mockEvent = createMockBarnEvent({ id: 'event-1', title: 'Costume Party' })

describe('EventEditPage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getEventById).mockReset()
    mockNotFound.mockClear()
    guardAs(managerMembership, mockBarn)
    vi.mocked(getEventById).mockResolvedValue(mockEvent)
  })

  // #1645 — every non-manager outcome is `requireMembership`'s since the hand-rolled check went;
  // see the New Event page test for the same assertion's rationale.
  it('should_guard_the_page_as_manager_only', async () => {
    await EventEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'event-1' }) })

    expect(vi.mocked(requireMembership).mock.calls[0]).toEqual(['green-acres', ['manager']])
  })

  it('should_call_notFound_when_event_does_not_exist', async () => {
    vi.mocked(getEventById).mockResolvedValue(null)

    await expect(
      EventEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'unknown' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_render_event_form_in_edit_mode', async () => {
    const jsx = await EventEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'event-1' }) })
    render(jsx)

    expect(screen.getByTestId('event-form').getAttribute('data-mode')).toBe('edit')
  })

  it('should_pass_event_data_to_form', async () => {
    const jsx = await EventEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'event-1' }) })
    render(jsx)

    expect(screen.getByTestId('event-form').getAttribute('data-event-title')).toBe('Costume Party')
  })

  it('should_pass_the_barns_timezone_to_the_form', async () => {
    const jsx = await EventEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'event-1' }) })
    render(jsx)

    expect(screen.getByTestId('event-form').getAttribute('data-timezone')).toBe('America/Denver')
  })

  it('should_bind_the_barns_schedule_range_reader_into_the_form', async () => {
    const jsx = await EventEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'event-1' }) })
    render(jsx)

    expect(screen.getByTestId('event-form').getAttribute('data-has-schedule-range')).toBe('true')
  })

  it('should_render_edit_event_heading', async () => {
    const jsx = await EventEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'event-1' }) })
    render(jsx)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Edit Event')
  })
})
