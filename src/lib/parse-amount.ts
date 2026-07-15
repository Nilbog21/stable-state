export function parseNonNegativeAmount(raw: string | null): number | null {
  if (!raw || raw.trim() === '') return null
  const n = parseFloat(raw)
  return isNaN(n) || n < 0 ? null : n
}

export function parseNonNegativeInt(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw.trim())) return null
  return parseInt(raw, 10)
}
