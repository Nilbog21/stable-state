import { describe, it, expect } from 'vitest'
import { formatOutstandingNotification, formatOutstandingExpensesNotification } from './generate-outstanding-notifications'

describe('formatOutstandingNotification', () => {
  it('should_use_singular_payment_in_title_when_count_is_one', () => {
    const { title } = formatOutstandingNotification(1, 100)
    expect(title).toBe('1 outstanding payment')
  })

  it('should_use_plural_payments_in_title_when_count_is_greater_than_one', () => {
    const { title } = formatOutstandingNotification(3, 450)
    expect(title).toBe('3 outstanding payments')
  })

  it('should_format_total_as_usd_currency_in_body', () => {
    const { body } = formatOutstandingNotification(3, 450)
    expect(body).toBe('$450.00 total')
  })

  it('should_format_multi_digit_totals_with_thousands_separator', () => {
    const { body } = formatOutstandingNotification(12, 12345.6)
    expect(body).toBe('$12,345.60 total')
  })
})

describe('formatOutstandingExpensesNotification', () => {
  it('should_use_singular_expense_in_title_when_count_is_one', () => {
    const { title } = formatOutstandingExpensesNotification(1)
    expect(title).toBe('1 outstanding expense')
  })

  it('should_use_plural_expenses_in_title_when_count_is_greater_than_one', () => {
    const { title } = formatOutstandingExpensesNotification(3)
    expect(title).toBe('3 outstanding expenses')
  })
})
