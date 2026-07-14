import { describe, it, expect } from 'vitest'
import { parseNonNegativeAmount } from '../parse-amount'

describe('parseNonNegativeAmount', () => {
  it('should_parse_valid_decimal', () => {
    expect(parseNonNegativeAmount('125.50')).toBe(125.5)
  })

  it('should_return_null_for_null_input', () => {
    expect(parseNonNegativeAmount(null)).toBeNull()
  })

  it('should_return_null_for_blank_string', () => {
    expect(parseNonNegativeAmount('   ')).toBeNull()
  })

  it('should_return_null_for_non_numeric_string', () => {
    expect(parseNonNegativeAmount('abc')).toBeNull()
  })

  it('should_return_null_for_negative_number', () => {
    expect(parseNonNegativeAmount('-5')).toBeNull()
  })

  it('should_accept_zero', () => {
    expect(parseNonNegativeAmount('0')).toBe(0)
  })
})
