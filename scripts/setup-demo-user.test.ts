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

  // #1619. The value `.env.example` shipped until this issue: reuse would have set the shared demo
  // user's real password to a string committed to this repo, and `formatDemoCredentialsOutput`
  // would have printed it back byte-identical to the line already in the developer's `.env.local`,
  // so nothing signalled it.
  it('should_mint_a_password_when_the_configured_one_is_the_env_example_placeholder', () => {
    expect(resolveDemoPassword('<demo-user-password>')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  // The negative that makes the anchoring a decision rather than an accident (#1619). This guard
  // is `/^<.*>$/` and not the substring match `run-checklist-suite.sh` uses, because a password is
  // user-chosen and may legitimately contain an angle bracket — the suite's values (a URL, two
  // JWTs, a hex string) cannot, and its placeholders are embedded rather than whole-value.
  it('should_reuse_a_password_that_merely_contains_angle_brackets', () => {
    expect(resolveDemoPassword('a<b>c')).toBe('a<b>c')
  })
})
