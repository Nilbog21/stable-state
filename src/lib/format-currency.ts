export function formatCurrency(amount: number, opts?: { forceParens?: boolean }): string {
  const value = opts?.forceParens ? -Math.abs(amount) : amount
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', currencySign: 'accounting' })
}

// Plain (non-accounting) USD rendering — unlike formatCurrency, negatives use a leading minus sign, not parens.
export function formatFee(fee: number): string {
  return fee.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
