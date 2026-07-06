export function formatCurrency(amount: number, opts?: { forceParens?: boolean }): string {
  const value = opts?.forceParens ? -Math.abs(amount) : amount
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', currencySign: 'accounting' })
}
