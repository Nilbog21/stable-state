import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership } from '@/test/fixtures'
import { guardAs } from '@/test/mocks/guard'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/app/actions/lessons', () => ({ getScheduleRangeForBarn: vi.fn() }))
vi.mock('../../../actions', () => ({
  createEventAction: vi.fn(),
}))
vi.mock('../../EventForm', () => ({
  EventForm: ({ mode, timezone, getScheduleRange }: { mode: string; timezone: string; getScheduleRange: unknown }) => (
    <div
      data-testid="event-form"
      data-mode={mode}
      data-timezone={timezone}
      data-has-schedule-range={typeof getScheduleRange === 'function'}
    >
      EventForm
    </div>
  ),
}))

import { requireMembership } from '@/lib/auth/guard'
import EventNewPage from '../page'

const mockBarn = createMockBarn({ timezone: 'America/Denver' })
const managerMembership = createMockMembership({ role: 'manager', status: 'active' })

describe('EventNewPage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    guardAs(managerMembership, mockBarn)
  })

  // #1645 — the page no longer hand-rolls the auth check it predated `requireMembership` by.
  // Every non-manager outcome (no user, unknown barn, wrong role, inactive membership) is the
  // guard's, and asserting the call is what says this page delegates all four rather than
  // re-deciding any of them.
  it('should_guard_the_page_as_manager_only', async () => {
    await EventNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })

    expect(vi.mocked(requireMembership).mock.calls[0]).toEqual(['green-acres', ['manager']])
  })

  it('should_render_event_form_in_new_mode', async () => {
    const jsx = await EventNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByTestId('event-form').getAttribute('data-mode')).toBe('new')
  })

  it('should_pass_the_barns_timezone_to_the_form', async () => {
    const jsx = await EventNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByTestId('event-form').getAttribute('data-timezone')).toBe('America/Denver')
  })

  // The always-open day panel's data source (#1580) — without it the panel renders its heading
  // over a permanently empty body.
  it('should_bind_the_barns_schedule_range_reader_into_the_form', async () => {
    const jsx = await EventNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByTestId('event-form').getAttribute('data-has-schedule-range')).toBe('true')
  })

  it('should_render_new_event_heading', async () => {
    const jsx = await EventNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('New Event')
  })
})
