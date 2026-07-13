import { describe, it, expect } from 'vitest'
import { isValidPhone } from '../phone'

describe('isValidPhone', () => {
  it('should_accept_plain_ten_digits', () => {
    expect(isValidPhone('5551234567')).toBe(true)
  })

  it('should_accept_digits_with_dashes', () => {
    expect(isValidPhone('555-123-4567')).toBe(true)
  })

  it('should_accept_digits_with_parens_and_spaces', () => {
    expect(isValidPhone('(555) 123 4567')).toBe(true)
  })

  it('should_accept_digits_with_plus_country_code', () => {
    expect(isValidPhone('+44 20 7946 0958')).toBe(true)
  })

  it('should_accept_exactly_seven_digits', () => {
    expect(isValidPhone('1234567')).toBe(true)
  })

  it('should_accept_exactly_fifteen_digits', () => {
    expect(isValidPhone('123456789012345')).toBe(true)
  })

  it('should_reject_six_digits', () => {
    expect(isValidPhone('123456')).toBe(false)
  })

  it('should_reject_sixteen_digits', () => {
    expect(isValidPhone('1234567890123456')).toBe(false)
  })

  it('should_reject_letters', () => {
    expect(isValidPhone('555-CALL-NOW')).toBe(false)
  })

  it('should_reject_string_with_no_digits', () => {
    expect(isValidPhone('+ - ()')).toBe(false)
  })
})
