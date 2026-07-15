import { describe, it, expect } from 'vitest'
import { getExhaustionBand } from '../exhaustion-band'

describe('getExhaustionBand', () => {
  const thresholds = { high: 11, moderate: 5 }

  it('should_return_low_when_total_is_below_moderate', () => {
    expect(getExhaustionBand(0, thresholds)).toBe('low')
  })

  it('should_return_low_when_total_equals_moderate', () => {
    expect(getExhaustionBand(5, thresholds)).toBe('low')
  })

  it('should_return_moderate_when_total_is_just_above_moderate', () => {
    expect(getExhaustionBand(6, thresholds)).toBe('moderate')
  })

  it('should_return_moderate_when_total_equals_high', () => {
    expect(getExhaustionBand(11, thresholds)).toBe('moderate')
  })

  it('should_return_high_when_total_is_just_above_high', () => {
    expect(getExhaustionBand(12, thresholds)).toBe('high')
  })
})
