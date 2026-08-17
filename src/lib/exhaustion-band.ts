export type ExhaustionBand = 'low' | 'moderate' | 'high'

/** How the app names a band to a user. 'Moderate'/'High' are the words the barn's own
 *  threshold fields already use (settings/ExhaustionThresholdsForm.tsx), so a caption and
 *  the setting that produced it read as the same scale. */
export const BAND_LABEL: Record<ExhaustionBand, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
}

export function getExhaustionBand(total: number, thresholds: { high: number; moderate: number }): ExhaustionBand {
  if (total <= thresholds.moderate) return 'low'
  if (total <= thresholds.high) return 'moderate'
  return 'high'
}
