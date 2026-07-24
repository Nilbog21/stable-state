import { describe, it, expect } from 'vitest'
import { buildInvitePath } from './seed-account'

describe('buildInvitePath', () => {
  it('should_build_register_path_from_slug_and_token', () => {
    expect(buildInvitePath('dev-barn', 'abc-123')).toBe('/barn/dev-barn/register?token=abc-123')
  })

  it('should_use_given_slug_in_path', () => {
    expect(buildInvitePath('other-barn', 'abc-123')).toContain('/barn/other-barn/')
  })

  it('should_append_token_as_query_param', () => {
    expect(buildInvitePath('dev-barn', 'f00d-cafe')).toContain('?token=f00d-cafe')
  })
})
