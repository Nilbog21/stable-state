/**
 * WCAG contrast against the *installed* Tailwind palette.
 *
 * Colours are read from `node_modules/tailwindcss/theme.css` rather than a hardcoded hex map, so
 * a caller can't drift from what the browser actually paints on a Tailwind upgrade. Tailwind 4
 * declares its palette as oklch, which is a perceptual space -- WCAG luminance needs sRGB, hence
 * the conversion below.
 *
 * Extracted from `Badge.test.tsx` (#1219) when #1548 gave `Button` a colour pair of its own to
 * assert. Lives under `src/test/`, which `vitest.config.ts` excludes from coverage -- a helper
 * inside a `__tests__` directory would be instrumented and would need its own tests.
 */
import { readFileSync } from 'node:fs'

const THEME = readFileSync('node_modules/tailwindcss/theme.css', 'utf8')

function srgb(colorName: string): [number, number, number] {
  const oklch = THEME.match(new RegExp(`--color-${colorName}:\\s*oklch\\(([\\d.]+)% ([\\d.]+) ([\\d.]+)\\)`))
  if (oklch === null) {
    const hex = THEME.match(new RegExp(`--color-${colorName}:\\s*#([0-9a-f]+);`))
    if (hex === null) throw new Error(`no such Tailwind colour: ${colorName}`)
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
  }
  const L = Number(oklch[1]) / 100
  const C = Number(oklch[2])
  const hRad = (Number(oklch[3]) * Math.PI) / 180
  const a = C * Math.cos(hRad)
  const b = C * Math.sin(hRad)
  // oklab -> LMS -> linear sRGB (Björn Ottosson's matrices)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return linear.map((v) => {
    const clamped = Math.min(Math.max(v, 0), 1)
    return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055
  }) as [number, number, number]
}

function luminance(colorName: string): number {
  const [r, g, b] = srgb(colorName).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contrast ratio between two Tailwind colour names, e.g. `contrast('zinc-900', 'zinc-200')`. */
export function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The page background each scheme paints behind everything else. */
export const PAGE = { light: 'white', dark: 'zinc-950' } as const

/**
 * The colour a Tailwind class string sets for one property in one scheme, e.g.
 * `colorToken('bg-zinc-500 dark:bg-zinc-600', 'bg', 'dark')` -> `'zinc-600'`.
 *
 * Only bare utilities count -- `hover:`, `active:` and `disabled:` variants are states, not the
 * resting pair, and measuring one of those would answer a question nobody asked.
 */
function colorToken(classes: string, kind: 'text' | 'bg', scheme: 'light' | 'dark'): string | undefined {
  const match = classes
    .split(' ')
    .filter((c) => c.startsWith('dark:') === (scheme === 'dark'))
    .map((c) => c.replace('dark:', ''))
    .filter((c) => !c.includes(':'))
    .find((c) => c.startsWith(`${kind}-`))
  return match === undefined ? undefined : match.slice(kind.length + 1)
}

/**
 * The light and dark background colour names in a Tailwind class string -- for a control whose
 * state is carried by fill alone, where there is no text pair to measure. A missing `dark:` token
 * inherits the light one, which is what a fill deliberately identical in both schemes looks like
 * (`Switch`'s off track) rather than an omission.
 */
export function bgColors(classes: string): { light: string; dark: string } {
  const light = colorToken(classes, 'bg', 'light')
  if (light === undefined) throw new Error(`no background colour in: ${classes}`)
  return { light, dark: colorToken(classes, 'bg', 'dark') ?? light }
}

/**
 * Splits a Tailwind class string into its light and dark `[text, bg]` colour names.
 *
 * `fallbackDark` decides what happens when the dark half omits a colour the light half declares.
 * Off (the strict default), that throws: a `Badge` tone with a light background and no dark one
 * renders its light background on a dark page, and silently measuring it against itself would
 * hide a real failure. On, the light value is inherited -- which is correct for `Button`, whose
 * `danger` variant deliberately keeps one `text-white` across both schemes.
 */
export function colorPairs(
  classes: string,
  { fallbackDark = false }: { fallbackDark?: boolean } = {}
): { light: [string, string]; dark: [string, string] } {
  const pick = (scheme: 'light' | 'dark') =>
    (['text', 'bg'] as const).map((kind) => {
      const own = colorToken(classes, kind, scheme)
      if (own !== undefined) return own
      const inherited = scheme === 'dark' && fallbackDark ? colorToken(classes, kind, 'light') : undefined
      if (inherited !== undefined) return inherited
      throw new Error(`no ${scheme} ${kind} colour in: ${classes}`)
    }) as [string, string]

  return { light: pick('light'), dark: pick('dark') }
}
