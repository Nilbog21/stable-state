export type ExhaustionBand = 'low' | 'moderate' | 'high'

export function getExhaustionBand(total: number, thresholds: { high: number; moderate: number }): ExhaustionBand {
  if (total <= thresholds.moderate) return 'low'
  if (total <= thresholds.high) return 'moderate'
  return 'high'
}
