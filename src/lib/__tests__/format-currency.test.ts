import { describe, it, expect } from 'vitest'
import { formatCurrency } from '../format-currency'

describe('formatCurrency', () => {
  it('should_format_positive_amount', () => {
    expect(formatCurrency(25)).toBe('$25.00')
  })

  it('should_format_negative_amount_with_accounting_parens', () => {
    expect(formatCurrency(-25)).toBe('($25.00)')
  })

  it('should_format_zero_without_parens', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })

  it('should_force_parens_on_positive_amount_when_forceParens_is_true', () => {
    expect(formatCurrency(25, { forceParens: true })).toBe('($25.00)')
  })

  it('should_not_double_negate_when_forceParens_is_true_and_amount_is_negative', () => {
    expect(formatCurrency(-25, { forceParens: true })).toBe('($25.00)')
  })

  it('should_force_parens_on_zero_when_forceParens_is_true', () => {
    expect(formatCurrency(0, { forceParens: true })).toBe('($0.00)')
  })
})
