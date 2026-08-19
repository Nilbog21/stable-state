import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({}),
}))
vi.mock('../lesson-finance-queries')
vi.mock('../member-names')
vi.mock('../horses')
vi.mock('../agreement-finances')
vi.mock('../lesson-tiers')

import {
  splitNetFee,
  computeGroupedIncome,
  computeHorseNetIncome,
} from '../lesson-finances'

describe('splitNetFee', () => {
  it('should_subtract_instructor_cut_from_fee_to_get_net_fee', () => {
    const { netFee } = splitNetFee(100, 25, 1)
    expect(netFee).toBe(75)
  })

  it('should_divide_net_fee_by_participant_count_to_get_split_amount', () => {
    const { splitAmount } = splitNetFee(100, 0, 2)
    expect(splitAmount).toBe(50)
  })

  it('should_net_the_cut_once_before_dividing_across_participants', () => {
    const { splitAmount } = splitNetFee(100, 20, 2)
    expect(splitAmount).toBe(40)
  })

  it('should_allow_a_negative_net_fee_when_cut_exceeds_fee', () => {
    const { netFee } = splitNetFee(10, 25, 1)
    expect(netFee).toBe(-15)
  })
})

describe('computeGroupedIncome', () => {
  it('should_assign_full_net_fee_to_single_key', () => {
    const result = computeGroupedIncome([{ fee: 100, instructorCut: 0 }], () => ['a'], 'FALLBACK')
    expect(result.get('a')).toEqual({ total: 100, count: 1 })
  })

  it('should_split_net_fee_evenly_across_multiple_keys', () => {
    const result = computeGroupedIncome([{ fee: 100, instructorCut: 0 }], () => ['a', 'b'], 'FALLBACK')
    expect([result.get('a')?.total, result.get('b')?.total]).toEqual([50, 50])
  })

  it('should_subtract_cut_once_per_row_before_splitting', () => {
    const result = computeGroupedIncome([{ fee: 100, instructorCut: 20 }], () => ['a', 'b'], 'FALLBACK')
    expect([result.get('a')?.total, result.get('b')?.total]).toEqual([40, 40])
  })

  it('should_use_each_rows_own_cut_rather_than_a_shared_rate', () => {
    const result = computeGroupedIncome(
      [{ fee: 100, instructorCut: 20 }, { fee: 100, instructorCut: 5 }],
      () => ['a'],
      'FALLBACK'
    )
    expect(result.get('a')).toEqual({ total: 175, count: 2 })
  })

  it('should_accumulate_net_fee_under_fallback_label_when_no_keys', () => {
    const result = computeGroupedIncome([{ fee: 100, instructorCut: 10 }], () => [], 'FALLBACK')
    expect(result.get('FALLBACK')).toEqual({ total: 90, count: 1 })
  })

  it('should_aggregate_multiple_rows_into_the_same_key', () => {
    const result = computeGroupedIncome(
      [{ fee: 100, instructorCut: 0 }, { fee: 50, instructorCut: 0 }],
      () => ['a'],
      'FALLBACK'
    )
    expect(result.get('a')).toEqual({ total: 150, count: 2 })
  })

  it('should_return_empty_map_for_empty_rows', () => {
    const result = computeGroupedIncome([], () => ['a'], 'FALLBACK')
    expect(result.size).toBe(0)
  })
})

describe('computeHorseNetIncome', () => {
  // #971: the first argument's totalIncome is now gross (pre-cut) — see HORSE_INCOME_DESCRIPTOR's
  // splitsGrossFee — so net here is a single gross-minus-expenses subtraction, not a double
  // subtraction of both cut and expenses.
  it('should_return_zero_expenses_for_income_only_horse', () => {
    const result = computeHorseNetIncome(
      [{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 100 }],
      []
    )
    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', gross: 100, expenses: 0, net: 100 }])
  })

  it('should_return_negative_net_for_expense_only_horse', () => {
    const result = computeHorseNetIncome(
      [],
      [{ horseId: 'horse-1', horseName: 'Thunderbolt', totalExpenses: 40 }]
    )
    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', gross: 0, expenses: 40, net: -40 }])
  })

  it('should_combine_income_and_expenses_for_same_horse', () => {
    const result = computeHorseNetIncome(
      [{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 100 }],
      [{ horseId: 'horse-1', horseName: 'Thunderbolt', totalExpenses: 40 }]
    )
    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', gross: 100, expenses: 40, net: 60 }])
  })

  it('should_sort_by_income_descending', () => {
    const result = computeHorseNetIncome(
      [
        { horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 50 },
        { horseId: 'horse-2', horseName: 'Shadow', totalIncome: 100 },
      ],
      []
    )
    expect(result.map((r) => r.horseId)).toEqual(['horse-2', 'horse-1'])
  })

  it('should_break_income_ties_alphabetically_by_horse_name', () => {
    const result = computeHorseNetIncome(
      [
        { horseId: 'horse-1', horseName: 'Zebra', totalIncome: 50 },
        { horseId: 'horse-2', horseName: 'Apple', totalIncome: 50 },
      ],
      []
    )
    expect(result.map((r) => r.horseName)).toEqual(['Apple', 'Zebra'])
  })

  it('should_return_empty_array_for_empty_inputs', () => {
    expect(computeHorseNetIncome([], [])).toEqual([])
  })
})
