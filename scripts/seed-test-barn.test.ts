import { describe, it, expect } from 'vitest'
import { splitDevName } from './seed-test-barn'

describe('splitDevName', () => {
  it('should_split_first_and_last_name_on_first_space', () => {
    expect(splitDevName('Adam Seefried')).toEqual({ firstName: 'Adam', lastName: 'Seefried' })
  })

  it('should_default_last_name_to_empty_string_when_no_space', () => {
    expect(splitDevName('Adam')).toEqual({ firstName: 'Adam', lastName: '' })
  })

  it('should_keep_remainder_as_last_name_when_multiple_spaces', () => {
    expect(splitDevName('Adam Van Buren')).toEqual({ firstName: 'Adam', lastName: 'Van Buren' })
  })
})
