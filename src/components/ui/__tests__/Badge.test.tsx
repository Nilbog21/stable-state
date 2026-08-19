import { describe, it, expect } from 'vitest'
import { toneClasses } from '../Badge'
import { colorPairs, contrast } from '@/test/tailwind-contrast'

describe('Badge tones', () => {
  const tones = Object.keys(toneClasses) as (keyof typeof toneClasses)[]

  it('should_define_at_least_one_tone', () => {
    expect(tones.length).toBeGreaterThan(0)
  })

  describe.each(tones)('%s', (tone) => {
    // Strict: a tone that declares a light background and no dark one renders the light one on a
    // dark page, and inheriting it here would measure it against itself. See colorPairs.
    const { light, dark } = colorPairs(toneClasses[tone])

    it('should_clear_wcag_aa_in_light_scheme', () => {
      expect(contrast(light[0], light[1])).toBeGreaterThanOrEqual(4.5)
    })

    it('should_clear_wcag_aa_in_dark_scheme', () => {
      expect(contrast(dark[0], dark[1])).toBeGreaterThanOrEqual(4.5)
    })
  })
})
