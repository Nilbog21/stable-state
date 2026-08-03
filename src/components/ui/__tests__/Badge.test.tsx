import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { toneClasses } from '../Badge'

// Colours are read from the installed Tailwind palette rather than a hardcoded hex
// map, so this test can't drift from what the browser actually paints on a Tailwind
// upgrade. Tailwind 4 declares its palette as oklch, which is a perceptual space --
// WCAG luminance needs sRGB, hence the conversion below.
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

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Splits one tone's class string into its light and dark [text, bg] colour names.
function pairs(classes: string): { light: [string, string]; dark: [string, string] } {
  const pick = (prefix: string) => {
    const tokens = classes
      .split(' ')
      .filter((c) => (prefix === '' ? !c.startsWith('dark:') : c.startsWith('dark:')))
      .map((c) => c.replace('dark:', ''))
    const find = (kind: string) => {
      const match = tokens.find((c) => c.startsWith(`${kind}-`))
      if (match === undefined) throw new Error(`tone has no ${prefix}${kind} colour: ${classes}`)
      return match.slice(kind.length + 1)
    }
    return [find('text'), find('bg')] as [string, string]
  }
  return { light: pick(''), dark: pick('dark:') }
}

describe('Badge tones', () => {
  const tones = Object.keys(toneClasses) as (keyof typeof toneClasses)[]

  it('should_define_at_least_one_tone', () => {
    expect(tones.length).toBeGreaterThan(0)
  })

  describe.each(tones)('%s', (tone) => {
    const { light, dark } = pairs(toneClasses[tone])

    it('should_clear_wcag_aa_in_light_scheme', () => {
      expect(contrast(light[0], light[1])).toBeGreaterThanOrEqual(4.5)
    })

    it('should_clear_wcag_aa_in_dark_scheme', () => {
      expect(contrast(dark[0], dark[1])).toBeGreaterThanOrEqual(4.5)
    })
  })
})
