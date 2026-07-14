export function parseNonNegativeAmount(raw: string | null): number | null {
  if (!raw || raw.trim() === '') return null
  const n = parseFloat(raw)
  return isNaN(n) || n < 0 ? null : n
}
