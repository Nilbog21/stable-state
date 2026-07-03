import { describe, it, expect } from 'vitest'
import { applyRememberMe, REMEMBER_ME_MAX_AGE } from '../cookie-options'

describe('applyRememberMe', () => {
  it('should_add_thirty_day_max_age_when_remember_is_1', () => {
    const result = applyRememberMe({ httpOnly: true }, 'token', '1')

    expect(result).toEqual({ httpOnly: true, maxAge: REMEMBER_ME_MAX_AGE })
  })

  it('should_override_existing_max_age_when_remember_is_1', () => {
    const result = applyRememberMe({ maxAge: 34560000 }, 'token', '1')

    expect(result).toEqual({ maxAge: REMEMBER_ME_MAX_AGE })
  })

  it('should_strip_max_age_when_remember_is_0', () => {
    const result = applyRememberMe({ httpOnly: true, maxAge: 34560000 }, 'token', '0')

    expect(result).toEqual({ httpOnly: true })
  })

  it('should_strip_expires_when_remember_is_0', () => {
    const result = applyRememberMe({ httpOnly: true, expires: new Date(0) }, 'token', '0')

    expect(result).toEqual({ httpOnly: true })
  })

  it('should_return_options_unchanged_when_remember_is_undefined', () => {
    const options = { httpOnly: true, maxAge: 34560000 }

    expect(applyRememberMe(options, 'token', undefined)).toBe(options)
  })

  it('should_return_options_unchanged_when_remember_is_empty_string', () => {
    const options = { maxAge: 34560000 }

    expect(applyRememberMe(options, 'token', '')).toBe(options)
  })

  it('should_return_options_unchanged_for_deletion_cookie_when_remember_is_1', () => {
    const options = { maxAge: 0 }

    expect(applyRememberMe(options, '', '1')).toBe(options)
  })

  it('should_return_options_unchanged_for_deletion_cookie_when_remember_is_0', () => {
    const options = { maxAge: 0 }

    expect(applyRememberMe(options, '', '0')).toBe(options)
  })

  it('should_expose_thirty_days_in_seconds_as_max_age_constant', () => {
    expect(REMEMBER_ME_MAX_AGE).toBe(2592000)
  })
})
