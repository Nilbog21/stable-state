import { describe, it, expect } from 'vitest'
import { buildTestUserEmail } from './seed-test-barn'

describe('buildTestUserEmail', () => {
  it('should_embed_slug_in_domain', () => {
    expect(buildTestUserEmail('test-barn-pr-99', 'manager')).toContain('test-barn-pr-99')
  })

  it('should_use_role_as_local_part_for_manager', () => {
    expect(buildTestUserEmail('test-barn-pr-99', 'manager')).toMatch(/^manager@/)
  })

  it('should_use_role_as_local_part_for_trainer', () => {
    expect(buildTestUserEmail('test-barn-pr-99', 'trainer')).toMatch(/^trainer@/)
  })

  it('should_use_role_as_local_part_for_rider', () => {
    expect(buildTestUserEmail('test-barn-pr-99', 'rider')).toMatch(/^rider@/)
  })

  it('should_produce_different_emails_for_different_roles', () => {
    const manager = buildTestUserEmail('test-barn-pr-1', 'manager')
    const trainer = buildTestUserEmail('test-barn-pr-1', 'trainer')
    expect(manager).not.toBe(trainer)
  })

  it('should_produce_different_emails_for_different_slugs', () => {
    const a = buildTestUserEmail('test-barn-pr-1', 'manager')
    const b = buildTestUserEmail('test-barn-pr-2', 'manager')
    expect(a).not.toBe(b)
  })
})

