import { describe, it, expect } from 'vitest'
import { mustSucceed } from './script-utils'

describe('mustSucceed', () => {
  it('should_throw_with_label_and_message_when_result_has_error', () => {
    expect(() =>
      mustSucceed({ data: null, error: { message: 'boom' } }, 'test-label')
    ).toThrow('test-label: boom')
  })

  it('should_return_data_when_result_has_no_error', () => {
    expect(mustSucceed({ data: [1, 2, 3], error: null }, 'ok')).toEqual([1, 2, 3])
  })
})
