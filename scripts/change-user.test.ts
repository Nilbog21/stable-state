import { describe, it, expect } from 'vitest'
import { mustSucceed, isSelfSelect, formatProfileLine, formatBarnLine, mergeMembersWithProfiles } from './change-user'

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

describe('isSelfSelect', () => {
  it('should_return_true_when_emails_match', () => {
    expect(isSelfSelect('dev@example.com', 'dev@example.com')).toBe(true)
  })

  it('should_return_false_when_emails_differ', () => {
    expect(isSelfSelect('dev@example.com', 'other@example.com')).toBe(false)
  })
})

describe('formatProfileLine', () => {
  const profile = { first_name: 'Alex', last_name: 'Trainer', email: 'alex@dev.local' }

  it('should_format_one_based_index_with_name_and_email', () => {
    expect(formatProfileLine(profile, 0)).toBe('1. Alex Trainer <alex@dev.local>')
  })

  it('should_increment_index_correctly', () => {
    expect(formatProfileLine(profile, 1)).toBe('2. Alex Trainer <alex@dev.local>')
  })
})

describe('formatBarnLine', () => {
  const barn = { name: 'Willow Creek', slug: 'willow-creek' }

  it('should_format_one_based_index_with_name_and_slug', () => {
    expect(formatBarnLine(barn, 0)).toBe('1. Willow Creek (willow-creek)')
  })

  it('should_increment_index_correctly', () => {
    expect(formatBarnLine(barn, 1)).toBe('2. Willow Creek (willow-creek)')
  })
})

describe('mergeMembersWithProfiles', () => {
  const profiles = [
    { id: 'p1', email: 'a@dev.local' },
    { id: 'p2', email: 'b@dev.local' },
  ]

  it('should_join_memberships_to_profiles_by_profile_id', () => {
    const memberships = [{ profile_id: 'p1' }, { profile_id: 'p2' }]
    expect(mergeMembersWithProfiles(memberships, profiles)).toEqual(profiles)
  })

  it('should_preserve_membership_order', () => {
    const memberships = [{ profile_id: 'p2' }, { profile_id: 'p1' }]
    expect(mergeMembersWithProfiles(memberships, profiles)).toEqual([profiles[1], profiles[0]])
  })

  it('should_drop_membership_whose_profile_is_missing', () => {
    const memberships = [{ profile_id: 'p1' }, { profile_id: 'missing' }]
    expect(mergeMembersWithProfiles(memberships, profiles)).toEqual([profiles[0]])
  })
})
