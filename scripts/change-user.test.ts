import { describe, it, expect } from 'vitest'
import {
  formatProfileLine,
  formatBarnLine,
  mergeMembersWithProfiles,
  planUserIdMoves,
  assertSlugRequiredForProd,
} from './change-user'

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

describe('planUserIdMoves', () => {
  const base = {
    devUserId: 'dev-user',
    devProfileId: 'dev-profile',
    target: { membershipId: 'm-target', profileId: 'p-target' },
    current: { membershipId: 'm-current', profileId: 'p-current' },
    currentOwnerUserId: 'current-user',
  }

  it('should_vacate_both_tables_before_taking_over', () => {
    expect(planUserIdMoves(base).map((m) => `${m.table}:${m.id}`)).toEqual([
      'barn_memberships:m-current',
      'profiles:p-current',
      'barn_memberships:m-target',
      'profiles:p-target',
    ])
  })

  it('should_restore_owner_user_id_on_both_vacated_rows', () => {
    expect(planUserIdMoves(base).slice(0, 2).map((m) => m.userId)).toEqual(['current-user', 'current-user'])
  })

  it('should_put_dev_user_id_on_both_target_rows', () => {
    expect(planUserIdMoves(base).slice(2).map((m) => m.userId)).toEqual(['dev-user', 'dev-user'])
  })

  it('should_null_vacated_rows_when_current_row_is_devs_own_profile', () => {
    const moves = planUserIdMoves({
      ...base,
      current: { membershipId: 'm-dev', profileId: 'dev-profile' },
      currentOwnerUserId: 'dev-user',
    })
    expect(moves.slice(0, 2).map((m) => m.userId)).toEqual([null, null])
  })

  it('should_null_vacated_rows_when_owner_has_no_auth_user', () => {
    const moves = planUserIdMoves({ ...base, currentOwnerUserId: null })
    expect(moves.slice(0, 2).map((m) => m.userId)).toEqual([null, null])
  })

  it('should_emit_only_takeover_moves_when_no_row_is_currently_inhabited', () => {
    expect(planUserIdMoves({ ...base, current: null })).toEqual([
      { table: 'barn_memberships', id: 'm-target', userId: 'dev-user' },
      { table: 'profiles', id: 'p-target', userId: 'dev-user' },
    ])
  })

  it('should_emit_only_takeover_moves_when_current_row_is_already_the_target', () => {
    const moves = planUserIdMoves({
      ...base,
      current: { membershipId: 'm-target', profileId: 'p-target' },
    })
    expect(moves).toHaveLength(2)
  })
})
