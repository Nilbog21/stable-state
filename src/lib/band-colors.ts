import type { ExhaustionBand } from '@/lib/exhaustion-band'

/**
 * The two renderings of one exhaustion scale, kept in one file so their hues can't drift
 * apart again -- they did, and a horse's ExhaustionBar read orange while the same horse's
 * calendar day read amber.
 *
 * They cannot share literal values: BAND_FILL_CLASS paints a saturated bar on a zinc track,
 * BAND_TINT_CLASS washes a cell background behind body text. The tint values would be
 * invisible as a bar, and the fill values unreadable behind text. What must stay aligned is
 * the hue family per band -- amber for moderate, red for high.
 */

/** Solid fill for a progress bar on a zinc track (ExhaustionBar). */
export const BAND_FILL_CLASS: Record<ExhaustionBand, string> = {
  low: 'bg-green-500',
  moderate: 'bg-amber-500',
  high: 'bg-red-500',
}

/**
 * Background wash behind a calendar cell's day number (MonthCalendarPicker).
 *
 * 'low' deliberately gets no background: with a horse selected most of the month is low, and
 * painting all of it green drowns out the moderate/high cells that actually need attention
 * (Refactoring UI's "emphasize by de-emphasizing"). The bar has no such option -- it is a
 * filled bar, so its 'low' must be a real colour.
 *
 * Dark mode uses solid colours rather than a tint at alpha. The page is #0a0a0a, so any hue
 * composited at low alpha lands in the same dark brown -- orange-500/30 and red-500/30 differ
 * by 14 in one channel, which is why moderate read as "high". Picking the dark values directly
 * sidesteps the compositing entirely, and separates the two bands in lightness as well as hue
 * (both are required: hue alone fails for red-green colour vision deficiency, and with 'low'
 * untinted there is no third colour to calibrate against).
 *
 * The two dark hexes are arbitrary values, not tokens, because no Tailwind pair holds the
 * separation: amber-900/red-900 differ by only 24 in green where these differ by 48.
 */
export const BAND_TINT_CLASS: Record<ExhaustionBand, string> = {
  low: '',
  moderate: 'bg-amber-200 dark:bg-[#6b4d10]',
  high: 'bg-red-300 dark:bg-[#8c1d18]',
}
