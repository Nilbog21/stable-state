import { describe, it, expect } from 'vitest'
import { mustAffect } from './must-affect'

const ok = (rows: unknown[]) => ({ data: rows, error: null })

describe('mustAffect with an expected count', () => {
  it('should_return_the_rows_when_the_count_matches', () => {
    expect(mustAffect(ok([{ id: 'a' }]), 'backdate the barn', 1)).toEqual([{ id: 'a' }])
  })

  it('should_throw_when_the_mutation_matched_nothing', () => {
    expect(() => mustAffect(ok([]), 'backdate the barn', 1)).toThrow()
  })

  it('should_throw_when_the_mutation_matched_more_rows_than_expected', () => {
    expect(() => mustAffect(ok([{ id: 'a' }, { id: 'b' }]), 'backdate the barn', 1)).toThrow()
  })

  // The message is the whole point of the helper over a bare `.length` check: #1424's backdate
  // failed silently, and a throw that says only "wrong count" sends the reader back to the query
  // to work out which write and how far off it was.
  it('should_name_the_label_and_both_counts_in_the_message', () => {
    expect(() => mustAffect(ok([]), 'backdate the barn', 1)).toThrow(
      'backdate the barn: matched 0 rows, expected 1'
    )
  })
})

describe('mustAffect with no expected count', () => {
  it('should_return_the_rows_when_at_least_one_matched', () => {
    expect(mustAffect(ok([{ id: 'a' }, { id: 'b' }]), 'collect the lesson fee')).toEqual([
      { id: 'a' },
      { id: 'b' },
    ])
  })

  it('should_throw_when_nothing_matched', () => {
    expect(() => mustAffect(ok([]), 'collect the lesson fee')).toThrow(
      'collect the lesson fee: matched 0 rows, expected at least 1'
    )
  })
})

describe('mustAffect edge cases', () => {
  // A `.select()`-less mutation returns `data: null`, and reading `.length` off it would throw a
  // TypeError naming neither the site nor the reason. Treated as zero rows so the message is the
  // same one every other empty result gets.
  it('should_treat_null_data_as_zero_rows', () => {
    expect(() => mustAffect({ data: null, error: null }, 'cancel the lesson', 1)).toThrow(
      'cancel the lesson: matched 0 rows, expected 1'
    )
  })

  // The error path is mustSucceed's, unchanged — a failed call is still reported as a failed call,
  // not as a count mismatch, which would misdirect the reader entirely.
  it('should_pass_a_postgrest_error_through_unchanged', () => {
    expect(() =>
      mustAffect({ data: null, error: { message: 'permission denied' } }, 'cancel the lesson', 1)
    ).toThrow('cancel the lesson: permission denied')
  })
})
