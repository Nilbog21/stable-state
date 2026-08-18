import { describe, it, expect } from 'vitest'
import { formatDemoCredentialsOutput, resolveDemoPassword } from './setup-demo-user'

describe('formatDemoCredentialsOutput', () => {
  it('should_format_email_and_password_as_env_lines', () => {
    expect(formatDemoCredentialsOutput('demo@stable-state.app', 'abc123')).toBe(
      'DEMO_USER_EMAIL=demo@stable-state.app\nDEMO_USER_PASSWORD=abc123'
    )
  })

  it('should_include_email_line', () => {
    expect(formatDemoCredentialsOutput('demo@stable-state.app', 'abc123')).toContain(
      'DEMO_USER_EMAIL=demo@stable-state.app'
    )
  })

  it('should_include_password_line', () => {
    expect(formatDemoCredentialsOutput('demo@stable-state.app', 'f00d-cafe')).toContain(
      'DEMO_USER_PASSWORD=f00d-cafe'
    )
  })
})

describe('resolveDemoPassword', () => {
  it('should_reuse_the_configured_password_when_one_is_set', () => {
    expect(resolveDemoPassword('already-in-env-local')).toBe('already-in-env-local')
  })

  it('should_mint_a_password_when_none_is_configured', () => {
    expect(resolveDemoPassword(undefined)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  it('should_mint_a_password_when_the_configured_one_is_empty', () => {
    expect(resolveDemoPassword('')).not.toBe('')
  })
})
