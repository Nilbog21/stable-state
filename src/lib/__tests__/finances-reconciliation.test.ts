import { describe, it, expect } from 'vitest'
import { buildReconciliationColumn, deriveNetColumn } from '../finances-reconciliation'

describe('buildReconciliationColumn', () => {
  it('should_derive_outside_as_total_minus_subtotal_minus_unattributed', () => {
    const column = buildReconciliationColumn(7290, 425, 90)
    expect(column).toEqual({ subtotal: 425, outside: 6775, unattributed: 90, total: 7290 })
  })

  it('should_return_zero_outside_when_subtotal_and_unattributed_account_for_the_whole_total', () => {
    const column = buildReconciliationColumn(1950, 1950, 0)
    expect(column.outside).toBe(0)
  })

  it('should_allow_negative_outside_when_subtotal_and_unattributed_overshoot_total', () => {
    // not expected in practice, but the formula shouldn't clamp or throw
    const column = buildReconciliationColumn(100, 150, 0)
    expect(column.outside).toBe(-50)
  })
})

describe('deriveNetColumn', () => {
  it('should_subtract_expenses_from_gross_field_by_field', () => {
    const gross = buildReconciliationColumn(1950, 1950, 0)
    const expenses = buildReconciliationColumn(7290, 425, 90)
    const net = deriveNetColumn(gross, expenses)
    expect(net).toEqual({
      subtotal: 1950 - 425,
      outside: 0 - 6775,
      unattributed: 0 - 90,
      total: 1950 - 7290,
    })
  })

  it('should_make_net_total_equal_gross_total_minus_expenses_total', () => {
    const gross = buildReconciliationColumn(1950, 1200, 50)
    const expenses = buildReconciliationColumn(7290, 6775, 90)
    const net = deriveNetColumn(gross, expenses)
    expect(net.total).toBe(1950 - 7290)
  })
})
