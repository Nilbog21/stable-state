/**
 * Shared reconciliation math for the Finances page's five breakdown tables (#971).
 * Every table's Gross and Expenses columns independently reconcile as
 * Subtotal + Outside this view + Unattributed = Total, where "outside" is
 * derived rather than tracked. Net is never computed independently — it's
 * always Gross minus Expenses, field by field, so it can never drift out of
 * sync with the other two columns.
 */

export interface ReconciliationColumn {
  subtotal: number
  outside: number
  unattributed: number
  total: number
}

export function buildReconciliationColumn(total: number, subtotal: number, unattributed: number): ReconciliationColumn {
  return { subtotal, outside: total - subtotal - unattributed, unattributed, total }
}

export function deriveNetColumn(gross: ReconciliationColumn, expenses: ReconciliationColumn): ReconciliationColumn {
  return {
    subtotal: gross.subtotal - expenses.subtotal,
    outside: gross.outside - expenses.outside,
    unattributed: gross.unattributed - expenses.unattributed,
    total: gross.total - expenses.total,
  }
}
