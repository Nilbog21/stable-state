import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/components/calendar/CalendarDayView', () => ({
  CalendarDayView: ({ items, role, slug, viewerMembershipId }: { items: unknown[]; role: string; slug: string; viewerMembershipId?: string }) => (
    <div data-testid="calendar-day-view" data-role={role} data-slug={slug} data-item-count={items.length} data-viewer-membership-id={viewerMembershipId} />
  ),
}))

vi.mock('@/components/calendar/CalendarWeekView', () => ({
  CalendarWeekView: ({ days, role, slug, viewerMembershipId, todayStr }: { days: unknown[]; role: string; slug: string; viewerMembershipId?: string; todayStr: string }) => (
    <div data-testid="calendar-week-view" data-role={role} data-slug={slug} data-day-count={days.length} data-viewer-membership-id={viewerMembershipId} data-today-str={todayStr} />
  ),
}))

vi.mock('@/components/calendar/DashboardMonthCalendar', () => ({
  DashboardMonthCalendar: ({ days, role, slug, month, selectedDate, viewerMembershipId }: { days: unknown[]; role: string; slug: string; month: string; selectedDate: string; viewerMembershipId?: string }) => (
    <div data-testid="calendar-month-view" data-role={role} data-slug={slug} data-day-count={days.length} data-month={month} data-selected-date={selectedDate} data-viewer-membership-id={viewerMembershipId} />
  ),
}))

vi.mock('../DocumentRemindersSection', () => ({
  DocumentRemindersSection: ({ slug, dueDocuments }: { slug: string; dueDocuments: { id: string }[] }) => (
    <div data-testid="document-reminders" data-slug={slug} data-due-count={dueDocuments.length} />
  ),
}))

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))

vi.mock('@/lib/db/schedule', () => ({
  getScheduleForRange: vi.fn(),
  scopeScheduleItemsForRole: vi.fn((items: unknown[]) => items),
}))

vi.mock('@/lib/db/lessons', () => ({
  getLessonsByIds: vi.fn(),
}))

vi.mock('@/lib/db/expenses', () => ({
  getExpensesByIds: vi.fn(),
}))

vi.mock('@/lib/db/barn-events', () => ({
  getEventsByIds: vi.fn(),
}))

vi.mock('@/lib/db/documents', () => ({
  getDueDocuments: vi.fn(),
}))

vi.mock('@/lib/db/outstanding', () => ({
  getOutstandingLessons: vi.fn(),
  getOutstandingCancellationFees: vi.fn(),
}))

vi.mock('@/lib/db/agreement-finances', () => ({
  getOutstandingCharges: vi.fn(),
}))

const mockNotFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
)

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
}))

import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getScheduleForRange, scopeScheduleItemsForRole } from '@/lib/db/schedule'
import { getLessonsByIds } from '@/lib/db/lessons'
import { getExpensesByIds } from '@/lib/db/expenses'
import { getEventsByIds } from '@/lib/db/barn-events'
import { getDueDocuments } from '@/lib/db/documents'
import { getOutstandingLessons, getOutstandingCancellationFees } from '@/lib/db/outstanding'
import { getOutstandingCharges } from '@/lib/db/agreement-finances'
import { createMockLessonWithDetails, createMockExpenseWithHorses, createMockBarn, createMockMembership, createMockScheduleItem } from '@/test/fixtures'
import type { ScheduleItem } from '@/lib/db/types'
import BarnDashboardPage from '../page'
import { calendarDate } from '@/lib/local-day'
import { barnToday } from '@/lib/barn-timezone'

const mockBarn = createMockBarn({ id: 'barn-1', name: 'Green Acres', slug: 'green-acres', default_instructor_cut: 25, created_at: '', timezone: 'America/New_York' })
const mockUser = { id: 'user-1', email: 'user@example.com' }

const mockManagerMembership = createMockMembership({
  id: 'mem-mgr',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'manager' as const,
  status: 'active' as const,
  created_at: '',
})

const mockTrainerMembership = createMockMembership({
  id: 'mem-trn',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'trainer' as const,
  status: 'active' as const,
  created_at: '',
})

const mockRiderMembership = createMockMembership({
  id: 'mem-rdr',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'rider' as const,
  status: 'active' as const,
  created_at: '',
})

function setupAuth(user: typeof mockUser | null = mockUser) {
  vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
}

function renderPage(searchParams: { date?: string; view?: string } = {}) {
  return BarnDashboardPage({
    params: Promise.resolve({ slug: 'green-acres' }),
    searchParams: Promise.resolve(searchParams),
  })
}

const lessonItem: ScheduleItem = createMockScheduleItem({ id: 'lesson-1', instructorId: 'mem-trn' })

describe('BarnDashboardPage', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getScheduleForRange).mockReset()
    vi.mocked(getScheduleForRange).mockResolvedValue([])
    vi.mocked(scopeScheduleItemsForRole).mockReset()
    vi.mocked(scopeScheduleItemsForRole).mockImplementation((items: ScheduleItem[]) => items)
    vi.mocked(getLessonsByIds).mockReset()
    vi.mocked(getLessonsByIds).mockResolvedValue([])
    vi.mocked(getExpensesByIds).mockReset()
    vi.mocked(getExpensesByIds).mockResolvedValue([])
    vi.mocked(getEventsByIds).mockReset()
    vi.mocked(getEventsByIds).mockResolvedValue([])
    vi.mocked(getDueDocuments).mockReset()
    vi.mocked(getDueDocuments).mockResolvedValue([])
    vi.mocked(getOutstandingLessons).mockReset()
    vi.mocked(getOutstandingLessons).mockResolvedValue([])
    vi.mocked(getOutstandingCancellationFees).mockReset()
    vi.mocked(getOutstandingCancellationFees).mockResolvedValue([])
    vi.mocked(getOutstandingCharges).mockReset()
    vi.mocked(getOutstandingCharges).mockResolvedValue([])
  })

  it('should_throw_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    try { await renderPage() } catch {}

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_render_dashboard_heading', async () => {
    const jsx = await renderPage()
    render(jsx)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Dashboard')
  })

  it('should_render_calendar_day_view_for_manager', async () => {
    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByTestId('calendar-day-view').getAttribute('data-role')).toBe('manager')
  })

  it('should_render_calendar_day_view_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)

    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByTestId('calendar-day-view').getAttribute('data-role')).toBe('trainer')
  })

  it('should_render_calendar_day_view_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)

    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByTestId('calendar-day-view').getAttribute('data-role')).toBe('rider')
  })

  it('should_not_render_calendar_day_view_when_unauthenticated', async () => {
    setupAuth(null)

    const jsx = await renderPage()
    render(jsx)

    expect(screen.queryByTestId('calendar-day-view')).toBeNull()
  })

  it('should_pass_slug_to_calendar_day_view', async () => {
    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByTestId('calendar-day-view').getAttribute('data-slug')).toBe('green-acres')
  })

  it('should_pass_viewer_membership_id_to_calendar_day_view', async () => {
    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByTestId('calendar-day-view').getAttribute('data-viewer-membership-id')).toBe(mockManagerMembership.id)
  })

  it('should_default_to_barn_local_today_when_no_date_param', async () => {
    await renderPage()

    // barn.timezone is America/New_York; the test runner's "now" is real time, so just
    // assert the from/to bound is a 24h window (dayEnd - dayStart === 1 day).
    const [, from, to] = vi.mocked(getScheduleForRange).mock.calls[0]
    expect(new Date(to as string).getTime() - new Date(from as string).getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it('should_fetch_the_requested_date_when_a_valid_date_param_is_given', async () => {
    await renderPage({ date: calendarDate('2026-01-15') })

    const [, from] = vi.mocked(getScheduleForRange).mock.calls[0]
    // 2026-01-15 America/New_York (EST, UTC-5) midnight => 2026-01-15T05:00:00.000Z
    expect(from).toBe('2026-01-15T05:00:00.000Z')
  })

  it('should_fall_back_to_today_when_the_date_param_is_malformed', async () => {
    await renderPage({ date: 'not-a-date' })

    const [, from] = vi.mocked(getScheduleForRange).mock.calls[0]
    expect(from).not.toBe('not-a-date')
  })

  it('should_scope_schedule_items_for_the_callers_role_and_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    vi.mocked(getScheduleForRange).mockResolvedValue([lessonItem])

    await renderPage()

    expect(scopeScheduleItemsForRole).toHaveBeenCalledWith([lessonItem], 'trainer', mockTrainerMembership.id)
  })

  it('should_fetch_lessons_by_the_scoped_lesson_ids', async () => {
    vi.mocked(getScheduleForRange).mockResolvedValue([lessonItem])
    vi.mocked(scopeScheduleItemsForRole).mockReturnValue([lessonItem])

    await renderPage()

    expect(getLessonsByIds).toHaveBeenCalledWith(mockBarn.id, ['lesson-1'], 'America/New_York')
  })

  it('should_fetch_events_by_the_scoped_event_ids', async () => {
    const eventItem: ScheduleItem = createMockScheduleItem({ id: 'event-1', itemType: 'event', durationMinutes: 0 })
    vi.mocked(getScheduleForRange).mockResolvedValue([eventItem])
    vi.mocked(scopeScheduleItemsForRole).mockReturnValue([eventItem])

    await renderPage()

    expect(getEventsByIds).toHaveBeenCalledWith(mockBarn.id, ['event-1'], 'America/New_York')
  })

  it('should_filter_expenses_to_planned_only_amount_is_null', async () => {
    const expenseItem: ScheduleItem = createMockScheduleItem({ id: 'expense-1', itemType: 'expense', durationMinutes: 0 })
    vi.mocked(getScheduleForRange).mockResolvedValue([expenseItem])
    vi.mocked(scopeScheduleItemsForRole).mockReturnValue([expenseItem])
    vi.mocked(getExpensesByIds).mockResolvedValue([
      createMockExpenseWithHorses({ id: 'expense-1', amount: 50 }),
    ])

    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByTestId('calendar-day-view').getAttribute('data-item-count')).toBe('0')
  })

  it('should_include_planned_expenses_with_null_amount', async () => {
    const expenseItem: ScheduleItem = createMockScheduleItem({ id: 'expense-1', itemType: 'expense', durationMinutes: 0 })
    vi.mocked(getScheduleForRange).mockResolvedValue([expenseItem])
    vi.mocked(scopeScheduleItemsForRole).mockReturnValue([expenseItem])
    vi.mocked(getExpensesByIds).mockResolvedValue([
      createMockExpenseWithHorses({ id: 'expense-1', amount: null }),
    ])

    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByTestId('calendar-day-view').getAttribute('data-item-count')).toBe('1')
  })

  it('should_pass_lesson_item_count_to_calendar_day_view', async () => {
    vi.mocked(getScheduleForRange).mockResolvedValue([lessonItem])
    vi.mocked(scopeScheduleItemsForRole).mockReturnValue([lessonItem])
    vi.mocked(getLessonsByIds).mockResolvedValue([createMockLessonWithDetails({ id: 'lesson-1' })])

    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByTestId('calendar-day-view').getAttribute('data-item-count')).toBe('1')
  })

  it('should_render_previous_day_link_with_the_expected_date_param', async () => {
    const jsx = await renderPage({ date: calendarDate('2026-07-23') })
    render(jsx)

    const link = screen.getByRole('link', { name: 'Previous day' }) as HTMLAnchorElement
    expect(link.href).toContain('date=2026-07-22')
  })

  it('should_render_next_day_link_with_the_expected_date_param', async () => {
    const jsx = await renderPage({ date: calendarDate('2026-07-23') })
    render(jsx)

    const link = screen.getByRole('link', { name: 'Next day' }) as HTMLAnchorElement
    expect(link.href).toContain('date=2026-07-24')
  })

  it('should_show_a_today_link_when_viewing_a_different_day', async () => {
    const jsx = await renderPage({ date: calendarDate('2026-01-01') })
    render(jsx)

    const link = screen.getByRole('link', { name: 'Today' }) as HTMLAnchorElement
    expect(link.href).toBe('http://localhost:3000/barn/green-acres')
  })

  it('should_hide_the_today_link_when_already_viewing_today', async () => {
    const jsx = await renderPage()
    render(jsx)

    expect(screen.queryByRole('link', { name: 'Today' })).toBeNull()
  })

  it('should_not_render_sign_out_button', async () => {
    const jsx = await renderPage()
    render(jsx)
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull()
  })

  const mockDueHorseDoc = {
    id: 'doc-1',
    entity: 'horse' as const,
    recordType: 'coggins',
    fileName: 'coggins.pdf',
    reminderDate: calendarDate('2026-01-01'),
    ownerName: 'Thunderbolt',
    ownerId: 'horse-1',
  }

  it('should_pass_due_documents_to_document_reminders_section', async () => {
    vi.mocked(getDueDocuments).mockResolvedValue([mockDueHorseDoc])

    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByTestId('document-reminders').getAttribute('data-due-count')).toBe('1')
  })

  it('should_pass_slug_to_document_reminders_section', async () => {
    vi.mocked(getDueDocuments).mockResolvedValue([mockDueHorseDoc])

    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByTestId('document-reminders').getAttribute('data-slug')).toBe('green-acres')
  })

  // #1224 -- the due/not-yet-due cutoff is the barn's own day, applied by the fetch itself rather
  // than the server host's UTC day (which runs ahead of every barn zone) with a narrower re-filter
  // downstream. Pinned to 03:00Z on the 2nd, which is still the 1st in America/New_York.
  it('should_fetch_due_documents_with_the_barns_day_not_the_server_hosts_utc_day', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-03-02T03:00:00Z'))
    try {
      await renderPage()
      expect(getDueDocuments).toHaveBeenCalledWith(mockBarn.id, '2026-03-01')
    } finally {
      vi.useRealTimers()
    }
  })

  // #1224 -- the Reminders header used to be computed from the raw pre-filter count, so a document
  // due only by the server's UTC day rendered a header with no cards under it. With the cutoff in
  // the fetch, that document is never returned and the header stays away.
  it('should_not_render_reminders_heading_when_the_only_document_is_due_after_the_barns_day', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-03-02T03:00:00Z'))
    vi.mocked(getDueDocuments).mockImplementation(async (_barnId: string, today: string) =>
      [{ ...mockDueHorseDoc, reminderDate: calendarDate('2026-03-02') }].filter((doc) => doc.reminderDate <= today)
    )
    try {
      const jsx = await renderPage()
      render(jsx)

      expect(screen.queryByRole('heading', { name: 'Reminders' })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('should_not_call_getDueDocuments_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)

    await renderPage()

    expect(getDueDocuments).not.toHaveBeenCalled()
  })

  it('should_not_call_getDueDocuments_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)

    await renderPage()

    expect(getDueDocuments).not.toHaveBeenCalled()
  })

  it('should_not_render_reminders_heading_when_nothing_to_show', async () => {
    const jsx = await renderPage()
    render(jsx)

    expect(screen.queryByRole('heading', { name: 'Reminders' })).toBeNull()
  })

  it('should_render_reminders_heading_when_unpaid_lessons_count_nonzero', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([{ id: 'l1' }] as any)

    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByRole('heading', { name: 'Reminders' })).toBeDefined()
  })

  it('should_render_unpaid_lessons_card_with_singular_text_when_count_is_one', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([{ id: 'l1' }] as any)

    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByText('1 unpaid lesson')).toBeDefined()
  })

  it('should_render_unpaid_lessons_card_with_plural_text_when_count_is_greater_than_one', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([{ id: 'l1' }, { id: 'l2' }] as any)

    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByText('2 unpaid lessons')).toBeDefined()
  })

  it('should_not_render_unpaid_lessons_card_when_count_is_zero', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([])

    const jsx = await renderPage()
    render(jsx)

    expect(screen.queryByText(/unpaid lesson/i)).toBeNull()
  })

  it('should_link_unpaid_lessons_card_to_finances_outstanding', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([{ id: 'l1' }] as any)

    const jsx = await renderPage()
    render(jsx)

    const link = screen.getByRole('link', { name: '1 unpaid lesson' }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/finances/outstanding?from=dashboard')
  })

  it('should_render_unpaid_lessons_card_when_only_cancellation_fee_outstanding', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([])
    vi.mocked(getOutstandingCancellationFees).mockResolvedValue([{ id: 'f1' }] as any)

    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByText('1 unpaid lesson')).toBeDefined()
  })

  it('should_sum_lesson_and_cancellation_fee_counts_in_unpaid_lessons_card', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([{ id: 'l1' }] as any)
    vi.mocked(getOutstandingCancellationFees).mockResolvedValue([{ id: 'f1' }, { id: 'f2' }] as any)

    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByText('3 unpaid lessons')).toBeDefined()
  })

  it('should_not_render_unpaid_lessons_card_when_both_lessons_and_cancellation_fees_are_empty', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([])
    vi.mocked(getOutstandingCancellationFees).mockResolvedValue([])

    const jsx = await renderPage()
    render(jsx)

    expect(screen.queryByText(/unpaid lesson/i)).toBeNull()
  })

  it('should_call_getOutstandingCancellationFees_with_user_id_and_role_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)

    await renderPage()

    expect(getOutstandingCancellationFees).toHaveBeenCalledWith(mockBarn.id, mockUser.id, mockRiderMembership.role)
  })

  it('should_render_unpaid_leases_boarding_card_with_singular_text_when_count_is_one', async () => {
    vi.mocked(getOutstandingCharges).mockResolvedValue([{ id: 'c1' }] as any)

    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByText('1 unpaid lease/boarding')).toBeDefined()
  })

  it('should_render_unpaid_leases_boarding_card_with_plural_text_when_count_is_greater_than_one', async () => {
    vi.mocked(getOutstandingCharges).mockResolvedValue([{ id: 'c1' }, { id: 'c2' }] as any)

    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByText('2 unpaid leases/boarding')).toBeDefined()
  })

  it('should_not_render_unpaid_leases_boarding_card_when_count_is_zero', async () => {
    vi.mocked(getOutstandingCharges).mockResolvedValue([])

    const jsx = await renderPage()
    render(jsx)

    expect(screen.queryByText(/unpaid lease/i)).toBeNull()
  })

  it('should_link_unpaid_leases_boarding_card_to_finances_outstanding', async () => {
    vi.mocked(getOutstandingCharges).mockResolvedValue([{ id: 'c1' }] as any)

    const jsx = await renderPage()
    render(jsx)

    const link = screen.getByRole('link', { name: '1 unpaid lease/boarding' }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/finances/outstanding?from=dashboard')
  })

  it('should_call_getOutstandingLessons_with_user_id_and_role_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)

    await renderPage()

    expect(getOutstandingLessons).toHaveBeenCalledWith(mockBarn.id, mockUser.id, mockRiderMembership.role)
  })

  it('should_call_getOutstandingCharges_with_user_id_and_role_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)

    await renderPage()

    expect(getOutstandingCharges).toHaveBeenCalledWith(mockBarn.id, mockBarn.timezone, mockUser.id, mockRiderMembership.role)
  })

  it('should_call_getOutstandingLessons_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)

    await renderPage()

    expect(getOutstandingLessons).toHaveBeenCalledWith(mockBarn.id, mockUser.id, mockTrainerMembership.role)
  })

  it('should_call_getOutstandingCharges_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)

    await renderPage()

    expect(getOutstandingCharges).toHaveBeenCalledWith(mockBarn.id, mockBarn.timezone, mockUser.id, mockTrainerMembership.role)
  })

  it('should_call_getOutstandingCancellationFees_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)

    await renderPage()

    expect(getOutstandingCancellationFees).toHaveBeenCalledWith(mockBarn.id, mockUser.id, mockTrainerMembership.role)
  })

  it('should_render_calendar_day_view_when_view_param_is_absent', async () => {
    const jsx = await renderPage()
    render(jsx)

    expect(screen.getByTestId('calendar-day-view')).toBeDefined()
    expect(screen.queryByTestId('calendar-week-view')).toBeNull()
  })

  it('should_render_calendar_day_view_when_view_param_is_invalid', async () => {
    const jsx = await renderPage({ view: 'year' })
    render(jsx)

    expect(screen.getByTestId('calendar-day-view')).toBeDefined()
  })

  it('should_render_the_month_calendar_when_view_param_is_month', async () => {
    const jsx = await renderPage({ view: 'month' })
    render(jsx)

    expect(screen.getByTestId('calendar-month-view')).toBeDefined()
    expect(screen.queryByTestId('calendar-day-view')).toBeNull()
    expect(screen.queryByTestId('calendar-week-view')).toBeNull()
  })

  it('should_pass_the_whole_42_cell_grid_to_the_month_calendar', async () => {
    const jsx = await renderPage({ view: 'month', date: calendarDate('2026-07-20') })
    render(jsx)

    expect(screen.getByTestId('calendar-month-view').getAttribute('data-day-count')).toBe('42')
  })

  it('should_pass_the_month_of_the_selected_date_to_the_month_calendar', async () => {
    const jsx = await renderPage({ view: 'month', date: calendarDate('2026-07-20') })
    render(jsx)

    expect(screen.getByTestId('calendar-month-view').getAttribute('data-month')).toBe('2026-07')
  })

  it('should_pass_slug_role_and_viewer_membership_id_to_the_month_calendar', async () => {
    const jsx = await renderPage({ view: 'month' })
    render(jsx)

    const el = screen.getByTestId('calendar-month-view')
    expect(el.getAttribute('data-slug')).toBe('green-acres')
    expect(el.getAttribute('data-role')).toBe('manager')
    expect(el.getAttribute('data-viewer-membership-id')).toBe(mockManagerMembership.id)
  })

  // The grid spills into the neighbouring months, so a range stopping at the month's own
  // boundaries would leave the leading and trailing cells permanently blank.
  it('should_fetch_the_full_grid_range_including_spill_over_days_in_month_view', async () => {
    await renderPage({ view: 'month', date: calendarDate('2026-07-20') })

    // July 2026's grid runs Sun 2026-06-28 through Sat 2026-08-08.
    const [, from, to] = vi.mocked(getScheduleForRange).mock.calls[0]
    expect(from).toContain('2026-06-28')
    expect(to).toContain('2026-08-09')
  })

  // The grid renders its own month heading and prev/next arrows -- two competing pagers in one
  // calendar is the bug this avoids.
  it('should_hide_the_pages_own_date_pager_in_month_view', async () => {
    const jsx = await renderPage({ view: 'month' })
    render(jsx)

    expect(screen.queryByRole('link', { name: /^Previous / })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Next / })).toBeNull()
  })

  it('should_mark_the_month_pill_active_in_month_view', async () => {
    const jsx = await renderPage({ view: 'month', date: calendarDate('2026-07-20') })
    render(jsx)

    expect(screen.getByRole('link', { name: 'Month' }).className).toContain('bg-zinc-900')
  })

  it('should_land_the_day_pill_on_the_first_of_the_month_when_the_viewed_month_excludes_today', async () => {
    const jsx = await renderPage({ view: 'month', date: calendarDate('2026-01-15') })
    render(jsx)

    const link = screen.getByRole('link', { name: 'Day' }) as HTMLAnchorElement
    expect(link.href).toContain('date=2026-01-01')
  })

  it('should_land_the_day_pill_on_today_when_the_viewed_month_includes_today', async () => {
    const todayStr = barnToday(mockBarn.timezone)
    const jsx = await renderPage({ view: 'month', date: calendarDate(todayStr) })
    render(jsx)

    const link = screen.getByRole('link', { name: 'Day' }) as HTMLAnchorElement
    expect(link.href).toContain(`date=${todayStr}`)
  })

  it('should_render_calendar_week_view_when_view_param_is_week', async () => {
    const jsx = await renderPage({ view: 'week' })
    render(jsx)

    expect(screen.getByTestId('calendar-week-view')).toBeDefined()
    expect(screen.queryByTestId('calendar-day-view')).toBeNull()
  })

  it('should_pass_seven_day_buckets_to_calendar_week_view', async () => {
    const jsx = await renderPage({ view: 'week' })
    render(jsx)

    expect(screen.getByTestId('calendar-week-view').getAttribute('data-day-count')).toBe('7')
  })

  it('should_pass_slug_and_viewer_membership_id_to_calendar_week_view', async () => {
    const jsx = await renderPage({ view: 'week' })
    render(jsx)

    const el = screen.getByTestId('calendar-week-view')
    expect(el.getAttribute('data-slug')).toBe('green-acres')
    expect(el.getAttribute('data-viewer-membership-id')).toBe(mockManagerMembership.id)
  })

  it('should_pass_a_valid_today_str_to_calendar_week_view', async () => {
    const jsx = await renderPage({ view: 'week' })
    render(jsx)

    const todayStrAttr = screen.getByTestId('calendar-week-view').getAttribute('data-today-str')
    expect(todayStrAttr).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('should_fetch_a_seven_day_range_in_week_view', async () => {
    await renderPage({ view: 'week', date: calendarDate('2026-07-20') })

    const [, from, to] = vi.mocked(getScheduleForRange).mock.calls[0]
    expect(new Date(to as string).getTime() - new Date(from as string).getTime()).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('should_anchor_the_week_view_range_to_the_calendar_weeks_sunday_for_a_mid_week_date', async () => {
    // 2026-07-23 is a Thursday; the calendar week containing it starts Sunday 2026-07-19
    await renderPage({ view: 'week', date: calendarDate('2026-07-23') })

    const [, from] = vi.mocked(getScheduleForRange).mock.calls[0]
    // 2026-07-19 America/New_York (EDT, UTC-4) midnight => 2026-07-19T04:00:00.000Z
    expect(from).toBe('2026-07-19T04:00:00.000Z')
  })

  it('should_scope_schedule_items_for_the_callers_role_in_week_view', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    vi.mocked(getScheduleForRange).mockResolvedValue([lessonItem])

    await renderPage({ view: 'week' })

    expect(scopeScheduleItemsForRole).toHaveBeenCalledWith([lessonItem], 'trainer', mockTrainerMembership.id)
  })

  it('should_render_day_pill_pointing_at_the_day_view', async () => {
    const jsx = await renderPage({ date: calendarDate('2026-07-20') })
    render(jsx)

    const link = screen.getByRole('link', { name: 'Day' }) as HTMLAnchorElement
    expect(link.href).toContain('date=2026-07-20')
    expect(link.href).not.toContain('view=week')
  })

  it('should_render_week_pill_pointing_at_the_week_view', async () => {
    const jsx = await renderPage({ date: calendarDate('2026-07-20') })
    render(jsx)

    const link = screen.getByRole('link', { name: 'Week' }) as HTMLAnchorElement
    expect(link.href).toContain('view=week')
    expect(link.href).toContain('date=2026-07-20')
  })

  it('should_land_the_day_pill_on_today_when_switching_from_a_week_view_that_includes_today', async () => {
    const jsx = await renderPage({ view: 'week' })
    render(jsx)

    const link = screen.getByRole('link', { name: 'Day' }) as HTMLAnchorElement
    const todayStr = screen.getByTestId('calendar-week-view').getAttribute('data-today-str')
    expect(link.href).toContain(`date=${todayStr}`)
  })

  it('should_land_the_day_pill_on_the_weeks_sunday_when_switching_from_a_week_view_that_does_not_include_today', async () => {
    // 2026-01-01 is a Thursday; the calendar week containing it starts Sunday 2025-12-28
    const jsx = await renderPage({ view: 'week', date: calendarDate('2026-01-01') })
    render(jsx)

    const link = screen.getByRole('link', { name: 'Day' }) as HTMLAnchorElement
    expect(link.href).toContain('date=2025-12-28')
  })

  it('should_mark_the_week_pill_active_in_week_view', async () => {
    const jsx = await renderPage({ view: 'week', date: calendarDate('2026-07-20') })
    render(jsx)

    const link = screen.getByRole('link', { name: 'Week' })
    expect(link.className).toContain('bg-zinc-900')
  })

  it('should_render_previous_week_link_stepping_by_seven_days', async () => {
    const jsx = await renderPage({ view: 'week', date: calendarDate('2026-07-23') })
    render(jsx)

    const link = screen.getByRole('link', { name: 'Previous week' }) as HTMLAnchorElement
    expect(link.href).toContain('date=2026-07-16')
    expect(link.href).toContain('view=week')
  })

  it('should_render_next_week_link_stepping_by_seven_days', async () => {
    const jsx = await renderPage({ view: 'week', date: calendarDate('2026-07-23') })
    render(jsx)

    const link = screen.getByRole('link', { name: 'Next week' }) as HTMLAnchorElement
    expect(link.href).toContain('date=2026-07-30')
    expect(link.href).toContain('view=week')
  })

  it('should_render_a_date_range_heading_in_week_view', async () => {
    // 2026-07-20 is a Monday; the calendar week containing it is Jul 19 (Sun) - Jul 25 (Sat)
    const jsx = await renderPage({ view: 'week', date: calendarDate('2026-07-20') })
    render(jsx)

    const heading = screen.getAllByRole('heading', { level: 2 }).find((h) => h.textContent !== 'Calendar')!
    expect(heading.textContent).toContain('Jul 19')
    expect(heading.textContent).toContain('Jul 25')
  })

  it('should_render_the_calendar_weeks_start_in_the_heading_regardless_of_the_selected_date', async () => {
    // 2026-07-23 is a Thursday inside the same Jul 19-25 calendar week
    const jsx = await renderPage({ view: 'week', date: calendarDate('2026-07-23') })
    render(jsx)

    const heading = screen.getAllByRole('heading', { level: 2 }).find((h) => h.textContent !== 'Calendar')!
    expect(heading.textContent).toContain('Jul 19')
  })

  it('should_render_the_calendar_weeks_end_in_the_heading_regardless_of_the_selected_date', async () => {
    // 2026-07-23 is a Thursday inside the same Jul 19-25 calendar week
    const jsx = await renderPage({ view: 'week', date: calendarDate('2026-07-23') })
    render(jsx)

    const heading = screen.getAllByRole('heading', { level: 2 }).find((h) => h.textContent !== 'Calendar')!
    expect(heading.textContent).toContain('Jul 25')
  })

  it('should_show_a_this_week_link_in_week_view_when_the_visible_week_does_not_include_today', async () => {
    const jsx = await renderPage({ view: 'week', date: calendarDate('2026-01-01') })
    render(jsx)

    const link = screen.getByRole('link', { name: 'This Week' }) as HTMLAnchorElement
    expect(link.href).toBe('http://localhost:3000/barn/green-acres?view=week')
  })

  it('should_hide_the_this_week_link_in_week_view_when_the_visible_week_includes_today', async () => {
    const jsx = await renderPage({ view: 'week' })
    render(jsx)

    expect(screen.queryByRole('link', { name: 'This Week' })).toBeNull()
  })

  it('should_render_this_week_suffix_in_the_heading_when_the_visible_week_includes_today', async () => {
    const jsx = await renderPage({ view: 'week' })
    render(jsx)

    const heading = screen.getAllByRole('heading', { level: 2 }).find((h) => h.textContent !== 'Calendar')!
    expect(heading.textContent).toContain('This Week')
  })

  describe('demo mode banner', () => {
    it('should_render_demo_banner_when_barn_is_demo', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(
        createMockBarn({ ...mockBarn, is_demo: true, created_at: '2026-05-17T00:00:00Z' })
      )
      const jsx = await renderPage()
      render(jsx)

      expect(screen.getByText(/this is a demo barn/i)).toBeDefined()
    })

    it('should_not_render_demo_banner_when_barn_is_not_demo', async () => {
      const jsx = await renderPage()
      render(jsx)

      expect(screen.queryByText(/this is a demo barn/i)).toBeNull()
    })

    it('should_render_reset_time_as_seven_hours_after_barn_created_at', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(
        createMockBarn({ ...mockBarn, is_demo: true, created_at: '2026-05-17T00:00:00Z' })
      )
      const jsx = await renderPage()
      render(jsx)

      expect(screen.getByText('3:00 AM', { exact: false })).toBeDefined()
    })
  })
})
