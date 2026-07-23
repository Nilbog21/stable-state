import { describe, it, expect } from 'vitest'
import { formatDemoCredentialsOutput } from './setup-demo-user'

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
