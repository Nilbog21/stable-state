import { describe, it, expect } from 'vitest'
import {
  mustSucceed,
  formatProfileLine,
  formatBarnLine,
  mergeMembersWithProfiles,
  resolveRevertUserId,
  assertSlugRequiredForProd,
} from './change-user'

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
  const barn = { name: 'Sunny Acres', slug: 'sunny-acres' }

  it('should_format_one_based_index_with_name_and_slug', () => {
    expect(formatBarnLine(barn, 0)).toBe('1. Sunny Acres (sunny-acres)')
  })

  it('should_increment_index_correctly', () => {
    expect(formatBarnLine(barn, 1)).toBe('2. Sunny Acres (sunny-acres)')
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

describe('assertSlugRequiredForProd', () => {
  it('should_throw_when_allow_prod_true_and_slug_missing', () => {
    expect(() => assertSlugRequiredForProd(undefined, true)).toThrow('CHANGE_USER_BARN_SLUG is required')
  })

  it('should_not_throw_when_allow_prod_true_and_slug_present', () => {
    expect(() => assertSlugRequiredForProd('test-barn', true)).not.toThrow()
  })

  it('should_not_throw_when_allow_prod_false_and_slug_missing', () => {
    expect(() => assertSlugRequiredForProd(undefined, false)).not.toThrow()
  })
})

describe('resolveRevertUserId', () => {
  it('should_return_null_when_current_row_is_devs_own_profile', () => {
    expect(resolveRevertUserId('dev-profile', 'dev-profile', 'dev-user')).toBeNull()
  })

  it('should_return_owner_user_id_when_current_row_belongs_to_another_profile', () => {
    expect(resolveRevertUserId('instructor-profile', 'dev-profile', 'instructor-user')).toBe('instructor-user')
  })
})
