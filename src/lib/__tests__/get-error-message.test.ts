import { describe, it, expect } from 'vitest'
import { getErrorMessage } from '../get-error-message'

describe('getErrorMessage', () => {
  it('should_return_message_when_err_is_error_instance', () => {
    expect(getErrorMessage(new Error('storage upload failed'))).toBe('storage upload failed')
  })

  it('should_stringify_when_err_is_not_error_instance', () => {
    expect(getErrorMessage('storage upload failed')).toBe('storage upload failed')
  })
})
