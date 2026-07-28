import { describe, it, expect } from 'vitest'
import { formatMissingUsersError, formatBlockingMembershipsError } from './e2e-auth-users'

describe('formatMissingUsersError', () => {
  it('should_name_each_missing_email', () => {
    expect(formatMissingUsersError(['manager@e2e.test', 'rider@e2e.test'])).toContain('rider@e2e.test')
  })

  it('should_name_the_create_remedy_command', () => {
    expect(formatMissingUsersError(['manager@e2e.test'])).toContain('scripts/e2e-auth-users.sh create')
  })
})

describe('formatBlockingMembershipsError', () => {
  it('should_name_each_blocking_barn_slug', () => {
    expect(formatBlockingMembershipsError(['test-barn-pr-1085', 'dev-barn'])).toContain('dev-barn')
  })

  it('should_name_the_teardown_remedy_command', () => {
    expect(formatBlockingMembershipsError(['dev-barn'])).toContain('scripts/teardown-test-barn.sh --all')
  })

  it('should_count_the_blocking_barns', () => {
    expect(formatBlockingMembershipsError(['a', 'b'])).toContain('2 barn(s)')
  })
})
