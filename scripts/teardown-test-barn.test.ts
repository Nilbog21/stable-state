import { describe, it, expect } from 'vitest'
import { TEST_ROLES } from './teardown-test-barn'

describe('TEST_ROLES', () => {
  it('should_include_manager', () => {
    expect(TEST_ROLES).toContain('manager')
  })

  it('should_include_trainer', () => {
    expect(TEST_ROLES).toContain('trainer')
  })

  it('should_include_rider', () => {
    expect(TEST_ROLES).toContain('rider')
  })

  it('should_include_rider2', () => {
    expect(TEST_ROLES).toContain('rider2')
  })

  it('should_include_pending', () => {
    expect(TEST_ROLES).toContain('pending')
  })
})
