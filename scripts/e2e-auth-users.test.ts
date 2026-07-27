import { describe, it, expect } from 'vitest'
import { formatMissingUsersError } from './e2e-auth-users'

describe('formatMissingUsersError', () => {
  it('should_name_each_missing_email', () => {
    expect(formatMissingUsersError(['manager@e2e.test', 'rider@e2e.test'])).toContain('rider@e2e.test')
  })

  it('should_name_the_create_remedy_command', () => {
    expect(formatMissingUsersError(['manager@e2e.test'])).toContain('scripts/e2e-auth-users.sh create')
  })
})
