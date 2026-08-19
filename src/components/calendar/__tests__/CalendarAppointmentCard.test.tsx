import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { CalendarAppointmentCard } from '../CalendarAppointmentCard'
import { formatExpenseTime } from '@/lib/format-expense'
import { makeExpense } from '@/test/fixtures'
import { calendarDate } from '@/lib/local-day'

describe('CalendarAppointmentCard', () => {
  it('should_render_formatted_time', () => {
    render(<CalendarAppointmentCard appointment={makeExpense({ expense_date: calendarDate('2026-07-15'), expense_time: '14:00:00' })} slug="green-acres" />)
    expect(screen.getByText(formatExpenseTime('14:00:00'))).toBeDefined()
  })

  // #1640: shows_on_calendar replaced the expense_time IS NOT NULL proxy rule, so a ticked
  // time-less appointment reaches this card for the first time. "All day" rather than
  // formatExpenseTime's "—", which on a calendar card reads as missing data.
  it('should_render_all_day_when_the_appointment_carries_no_time', () => {
    render(<CalendarAppointmentCard appointment={makeExpense({ expense_date: calendarDate('2026-07-15'), expense_time: null })} slug="green-acres" />)
    expect(screen.getByText('All day')).toBeDefined()
  })

  it('should_render_recipient', () => {
    render(<CalendarAppointmentCard appointment={makeExpense({ recipient: 'Dr. Smith' })} slug="green-acres" />)
    expect(screen.getByText('Dr. Smith')).toBeDefined()
  })

  it('should_render_appointment_type', () => {
    render(<CalendarAppointmentCard appointment={makeExpense({ expense_type: 'Veterinary' })} slug="green-acres" />)
    expect(screen.getByText('Veterinary')).toBeDefined()
  })

  it('should_render_horse_names', () => {
    render(<CalendarAppointmentCard appointment={makeExpense({ horse_names: ['Thunderbolt'] })} slug="green-acres" />)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
  })

  it('should_render_entire_barn_when_applies_to_all_horses', () => {
    render(<CalendarAppointmentCard appointment={makeExpense({ applies_to_all_horses: true, horse_names: [] })} slug="green-acres" />)
    expect(screen.getByText('Entire Barn')).toBeDefined()
  })

  // #1148: the card used to take a `role` prop purely to withhold the link from a
  // trainer, whose detail route would have 404'd them. That route now serves a trainer
  // a read-only appointment view, so the link is unconditional and the prop is gone.
  it('should_link_to_the_appointment_detail_page', () => {
    render(<CalendarAppointmentCard appointment={makeExpense({ id: 'expense-123' })} slug="green-acres" />)
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/expenses/expense-123')
  })
})
