import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('../member-names')
vi.mock('../transactions')

import { createClient } from '@/lib/supabase/server'
import { resolveMemberNames } from '../member-names'
import { getTransactionRows, getOutstandingTransactionRows } from '../transactions'
import type { TransactionRow } from '../transactions'
import { getChargesForSummary, getPaidCharges, getOutstandingCharges } from '../agreement-finances'
import { calendarDate } from '@/lib/local-day'

describe('getChargesForSummary', () => {
  const startDate = new Date('2026-07-01T00:00:00Z')
  const endDate = new Date('2026-08-01T00:00:00Z')

  beforeEach(() => {
    vi.mocked(getTransactionRows).mockReset()
  })

  it('should_delegate_to_getTransactionRows_with_charge_kinds_and_date_range', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([])
    await getChargesForSummary('barn-1', startDate, endDate)
    expect(getTransactionRows).toHaveBeenCalledWith(
      'barn-1', ['lease_charge', 'board_charge'], { startDate, endDate }, undefined
    )
  })

  it('should_map_rows_to_period_fee_and_payment_type', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([{
      id: 'txn-1', kind: 'lease_charge', amount: 200, collected: true, paymentType: 'venmo',
      membershipId: null, horseId: null, lessonId: null, lessonRiderId: null,
      agreementChargeId: 'charge-1', expenseId: null, occurredAt: '2026-07-01T00:00:00+00:00',
    }])
    const result = await getChargesForSummary('barn-1', startDate, endDate)
    expect(result).toEqual([{ period: calendarDate('2026-07-01'), fee: 200, payment_type: 'venmo' }])
  })

  it('should_return_empty_array_when_getTransactionRows_resolves_empty', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([])
    const result = await getChargesForSummary('barn-1', startDate, endDate)
    expect(result).toEqual([])
  })

  it('should_propagate_error_from_getTransactionRows', async () => {
    vi.mocked(getTransactionRows).mockRejectedValue(new Error('db error'))
    await expect(getChargesForSummary('barn-1', startDate, endDate)).rejects.toThrow('db error')
  })

  it('should_pass_injected_client_through_to_getTransactionRows', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([])
    const mockClient = {} as any
    await getChargesForSummary('barn-1', startDate, endDate, mockClient)
    expect(getTransactionRows).toHaveBeenCalledWith(
      'barn-1', ['lease_charge', 'board_charge'], { startDate, endDate }, mockClient
    )
  })
})

describe('getPaidCharges', () => {
  const startDate = new Date('2026-07-01T00:00:00Z')
  const endDate = new Date('2026-08-01T00:00:00Z')

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(getTransactionRows).mockReset()
  })

  function makeAgreementChargesChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockSelect, mockEq, mockIn }
  }

  function paidChargeRow(overrides: Partial<TransactionRow> = {}): TransactionRow {
    return {
      id: 'txn-1', kind: 'lease_charge', amount: 200, collected: true, paymentType: null,
      membershipId: 'rider-1', horseId: 'horse-1', lessonId: null, lessonRiderId: null,
      agreementChargeId: 'charge-1', expenseId: null, occurredAt: '2026-07-01T00:00:00+00:00',
      ...overrides,
    }
  }

  it('should_delegate_to_getTransactionRows_with_charge_kinds_and_collected_true', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([])
    const mockClient = { from: vi.fn() } as any
    vi.mocked(createClient).mockResolvedValue(mockClient)
    await getPaidCharges('barn-1', startDate, endDate)
    expect(getTransactionRows).toHaveBeenCalledWith(
      'barn-1', ['lease_charge', 'board_charge'], { startDate, endDate, collected: true }, mockClient
    )
  })

  it('should_query_agreement_charges_for_the_returned_charge_ids', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow()])
    const { mockEq, mockIn } = makeAgreementChargesChain([{ id: 'charge-1', agreement_id: 'agreement-1', period: '2026-07-01' }])
    await getPaidCharges('barn-1', startDate, endDate)
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(mockIn).toHaveBeenCalledWith('id', ['charge-1'])
  })

  it('should_dedupe_charge_ids_before_the_followup_query', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([
      paidChargeRow({ id: 'txn-1', agreementChargeId: 'charge-1' }),
      paidChargeRow({ id: 'txn-2', agreementChargeId: 'charge-1' }),
    ])
    const { mockIn } = makeAgreementChargesChain([{ id: 'charge-1', agreement_id: 'agreement-1', period: '2026-07-01' }])
    await getPaidCharges('barn-1', startDate, endDate)
    expect(mockIn).toHaveBeenCalledWith('id', ['charge-1'])
  })

  it('should_skip_followup_query_when_no_rows', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([])
    const { from } = makeAgreementChargesChain([])
    const result = await getPaidCharges('barn-1', startDate, endDate)
    expect(from).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('should_map_each_row_with_its_resolved_agreement_id', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow()])
    makeAgreementChargesChain([{ id: 'charge-1', agreement_id: 'agreement-1', period: '2026-07-01' }])

    const result = await getPaidCharges('barn-1', startDate, endDate)

    expect(result).toEqual([{
      chargeId: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-07-01'), fee: 200,
      kind: 'lease', riderId: 'rider-1', horseId: 'horse-1',
    }])
  })

  it('should_select_period_from_agreement_charges', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow()])
    const { mockSelect } = makeAgreementChargesChain([{ id: 'charge-1', agreement_id: 'agreement-1', period: '2026-07-01' }])
    await getPaidCharges('barn-1', startDate, endDate)
    expect(mockSelect).toHaveBeenCalledWith('id, agreement_id, period')
  })

  it('should_read_period_from_the_agreement_charges_column_rather_than_from_occurred_at', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow({ occurredAt: '2026-07-15T00:00:00+00:00' })])
    makeAgreementChargesChain([{ id: 'charge-1', agreement_id: 'agreement-1', period: '2026-07-01' }])
    const result = await getPaidCharges('barn-1', startDate, endDate)
    expect(result[0].period).toBe('2026-07-01')
  })

  it('should_fall_back_to_the_transactions_occurred_at_date_when_the_charge_row_is_missing', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow({ agreementChargeId: 'charge-missing' })])
    makeAgreementChargesChain([])
    const result = await getPaidCharges('barn-1', startDate, endDate)
    expect(result[0].period).toBe('2026-07-01')
  })

  it('should_fall_back_to_the_transactions_occurred_at_date_when_agreementChargeId_is_null', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow({ agreementChargeId: null })])
    makeAgreementChargesChain([])
    const result = await getPaidCharges('barn-1', startDate, endDate)
    expect(result[0].period).toBe('2026-07-01')
  })

  it('should_map_lease_charge_kind_to_lease', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow({ kind: 'lease_charge' })])
    makeAgreementChargesChain([{ id: 'charge-1', agreement_id: 'agreement-1', period: '2026-07-01' }])
    const result = await getPaidCharges('barn-1', startDate, endDate)
    expect(result[0].kind).toBe('lease')
  })

  it('should_map_board_charge_kind_to_board', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow({ kind: 'board_charge' })])
    makeAgreementChargesChain([{ id: 'charge-1', agreement_id: 'agreement-1', period: '2026-07-01' }])
    const result = await getPaidCharges('barn-1', startDate, endDate)
    expect(result[0].kind).toBe('board')
  })

  it('should_fall_back_to_the_raw_charge_id_when_agreement_lookup_has_no_match', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow({ agreementChargeId: 'charge-missing' })])
    makeAgreementChargesChain([])
    const result = await getPaidCharges('barn-1', startDate, endDate)
    expect(result[0].agreementId).toBe('charge-missing')
  })

  it('should_treat_null_agreement_charges_lookup_data_as_empty', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow({ agreementChargeId: 'charge-missing' })])
    makeAgreementChargesChain(null)
    const result = await getPaidCharges('barn-1', startDate, endDate)
    expect(result[0].agreementId).toBe('charge-missing')
  })

  it('should_throw_when_followup_query_errors', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow()])
    makeAgreementChargesChain(null, new Error('db error'))
    await expect(getPaidCharges('barn-1', startDate, endDate)).rejects.toThrow('db error')
  })

  it('should_propagate_error_from_getTransactionRows', async () => {
    vi.mocked(getTransactionRows).mockRejectedValue(new Error('db error'))
    await expect(getPaidCharges('barn-1', startDate, endDate)).rejects.toThrow('db error')
  })

  it('should_return_null_riderId_when_the_riders_membership_was_removed', async () => {
    // membership_id is nulled via ON DELETE SET NULL when a manager removes a rider's
    // barn_memberships row after their charge was already collected.
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow({ membershipId: null })])
    makeAgreementChargesChain([{ id: 'charge-1', agreement_id: 'agreement-1', period: '2026-07-01' }])
    const result = await getPaidCharges('barn-1', startDate, endDate)
    expect(result[0].riderId).toBeNull()
  })

  it('should_return_null_horseId_when_horseId_is_null', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow({ horseId: null })])
    makeAgreementChargesChain([{ id: 'charge-1', agreement_id: 'agreement-1', period: '2026-07-01' }])
    const result = await getPaidCharges('barn-1', startDate, endDate)
    expect(result[0].horseId).toBeNull()
  })

  it('should_filter_null_charge_ids_before_the_followup_query', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([
      paidChargeRow({ id: 'txn-1', agreementChargeId: null }),
      paidChargeRow({ id: 'txn-2', agreementChargeId: 'charge-2' }),
    ])
    const { mockIn } = makeAgreementChargesChain([{ id: 'charge-2', agreement_id: 'agreement-2', period: '2026-07-01' }])
    await getPaidCharges('barn-1', startDate, endDate)
    expect(mockIn).toHaveBeenCalledWith('id', ['charge-2'])
  })

  it('should_fall_back_to_the_transactions_own_id_as_chargeId_when_agreementChargeId_is_null', async () => {
    // No code path currently hard-deletes an agreement_charges row, but the FK is
    // ON DELETE SET NULL, so this is guarded defensively the same as lessonId/expenseId.
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow({ id: 'txn-orphan', agreementChargeId: null })])
    const { from } = makeAgreementChargesChain([])
    const result = await getPaidCharges('barn-1', startDate, endDate)
    expect(result[0].chargeId).toBe('txn-orphan')
    expect(result[0].agreementId).toBe('txn-orphan')
    expect(from).not.toHaveBeenCalled()
  })

  it('should_skip_followup_query_when_every_charge_id_is_null', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([paidChargeRow({ agreementChargeId: null })])
    const { from } = makeAgreementChargesChain([])
    await getPaidCharges('barn-1', startDate, endDate)
    expect(from).not.toHaveBeenCalled()
  })
})

describe('getOutstandingCharges', () => {
  // Every zone the barn picker offers is behind UTC; New York is the shallowest at 4-5h,
  // so a boundary this zone gets right is one every other BARN_TIMEZONES entry gets right too.
  const TZ = 'America/New_York'

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['rider-1', 'Alice Rider']]))
    vi.mocked(getOutstandingTransactionRows).mockReset().mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // an "unpaid" row for a given charge id, matching what get_outstanding_transactions
  // would relay for a lease_charge/board_charge transaction that hasn't been collected
  function unpaidCharge(chargeId: string) {
    return [{ kind: 'lease_charge' as const, entityId: chargeId, amount: 200, collected: false, paymentType: null }]
  }

  function makeChargesChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockIn = vi.fn().mockReturnValue({ order: mockOrder })
    const mockLt = vi.fn().mockReturnValue({ in: mockIn, order: mockOrder })
    const mockEq = vi.fn().mockReturnValue({ lt: mockLt })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockLt, mockIn, mockOrder }
  }

  function makeManagerChain(chargesData: unknown[] | null, chargesError: Error | null = null) {
    const charges = makeChargesChain(chargesData, chargesError)
    const from = vi.fn().mockReturnValue({ select: charges.select })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, charges }
  }

  function makeMembershipChain(data: unknown, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEqStatus = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEqRole = vi.fn().mockReturnValue({ eq: mockEqStatus })
    const mockEqUser = vi.fn().mockReturnValue({ eq: mockEqRole })
    const mockEqBarn = vi.fn().mockReturnValue({ eq: mockEqUser })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqBarn })
    return { select: mockSelect, mockEqBarn, mockEqUser, mockEqRole, mockEqStatus }
  }

  function makeRiderAgreementsChain(data: unknown[] | null, error: Error | null = null) {
    const mockEqRider = vi.fn().mockResolvedValue({ data, error })
    const mockEqBarn = vi.fn().mockReturnValue({ eq: mockEqRider })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqBarn })
    return { select: mockSelect, mockEqBarn, mockEqRider }
  }

  function makeRiderChain({
    membershipData,
    membershipError = null,
    riderAgreementsData = [],
    riderAgreementsError = null,
    chargesData = [],
    chargesError = null,
  }: {
    membershipData: unknown
    membershipError?: Error | null
    riderAgreementsData?: unknown[] | null
    riderAgreementsError?: Error | null
    chargesData?: unknown[] | null
    chargesError?: Error | null
  }) {
    const membership = makeMembershipChain(membershipData, membershipError)
    const riderAgreements = makeRiderAgreementsChain(riderAgreementsData, riderAgreementsError)
    const charges = makeChargesChain(chargesData, chargesError)

    const from = vi.fn((table: string) => {
      if (table === 'barn_memberships') return { select: membership.select }
      if (table === 'agreement_charges') return { select: charges.select }
      return { select: riderAgreements.select }
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, membership, riderAgreements, charges }
  }

  it('should_return_empty_array_without_querying_when_role_is_trainer', async () => {
    const result = await getOutstandingCharges('barn-1', TZ, 'user-trainer', 'trainer')
    expect(result).toEqual([])
    expect(createClient).not.toHaveBeenCalled()
  })

  it('should_select_with_the_agreements_fk_hint_embed', async () => {
    const { charges } = makeManagerChain([])
    await getOutstandingCharges('barn-1', TZ)
    expect(charges.select).toHaveBeenCalledWith(
      'id, agreement_id, period, fee, agreements!agreement_charges_barn_id_agreement_id_fkey!inner(kind, rider_id)'
    )
  })

  it('should_filter_by_barn_id_for_manager_role', async () => {
    const { charges } = makeManagerChain([])
    await getOutstandingCharges('barn-1', TZ)
    expect(charges.mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_not_call_the_outstanding_transactions_rpc_when_there_are_no_candidate_charges', async () => {
    makeManagerChain([])
    await getOutstandingCharges('barn-1', TZ)
    expect(getOutstandingTransactionRows).not.toHaveBeenCalled()
  })

  it('should_query_the_outstanding_transactions_rpc_with_candidate_charge_ids', async () => {
    makeManagerChain([{ id: 'charge-1', agreement_id: 'agreement-1', period: calendarDate('2026-06-01'), fee: 200, agreements: { kind: 'lease', rider_id: 'rider-1' } }])
    vi.mocked(getOutstandingTransactionRows).mockResolvedValue(unpaidCharge('charge-1'))
    await getOutstandingCharges('barn-1', TZ)
    expect(getOutstandingTransactionRows).toHaveBeenCalledWith('barn-1', { chargeIds: ['charge-1'] }, expect.anything())
  })

  it('should_exclude_a_candidate_charge_whose_ledger_transaction_is_already_collected', async () => {
    makeManagerChain([{ id: 'charge-1', agreement_id: 'agreement-1', period: calendarDate('2026-06-01'), fee: 200, agreements: { kind: 'lease', rider_id: 'rider-1' } }])
    vi.mocked(getOutstandingTransactionRows).mockResolvedValue([
      { kind: 'lease_charge', entityId: 'charge-1', amount: 200, collected: true, paymentType: 'venmo' },
    ])
    const result = await getOutstandingCharges('barn-1', TZ)
    expect(result).toEqual([])
  })

  it('should_filter_by_period_before_first_of_current_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'))
    const { charges } = makeManagerChain([])
    await getOutstandingCharges('barn-1', TZ)
    expect(charges.mockLt).toHaveBeenCalledWith('period', '2026-07-01')
  })

  it('should_not_treat_july_charges_as_overdue_on_the_last_evening_of_july_in_new_york', async () => {
    // 23:00 UTC on Jul 31 is 19:00 on Jul 31 in New York — the barn's month has not
    // rolled over yet, so July's own charges are still current, not overdue.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-31T23:00:00Z'))
    const { charges } = makeManagerChain([])
    await getOutstandingCharges('barn-1', TZ)
    expect(charges.mockLt).toHaveBeenCalledWith('period', '2026-07-01')
  })

  it('should_roll_the_boundary_over_once_the_barns_own_month_has_turned', async () => {
    // 05:00 UTC on Aug 1 is 01:00 on Aug 1 in New York — now the barn is in August too.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T05:00:00Z'))
    const { charges } = makeManagerChain([])
    await getOutstandingCharges('barn-1', TZ)
    expect(charges.mockLt).toHaveBeenCalledWith('period', '2026-08-01')
  })

  it('should_use_the_barns_own_zone_rather_than_the_server_host_utc_day', async () => {
    // Same instant as the New York case above, ten hours further west: Honolulu is
    // still on Jul 31 at 13:00, so it must reach the same July boundary.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-31T23:00:00Z'))
    const { charges } = makeManagerChain([])
    await getOutstandingCharges('barn-1', 'Pacific/Honolulu')
    expect(charges.mockLt).toHaveBeenCalledWith('period', '2026-07-01')
  })

  it('should_not_filter_by_agreement_id_for_manager_role', async () => {
    const { charges } = makeManagerChain([])
    await getOutstandingCharges('barn-1', TZ)
    expect(charges.mockIn).not.toHaveBeenCalled()
  })

  it('should_sort_ascending_by_period', async () => {
    const { charges } = makeManagerChain([])
    await getOutstandingCharges('barn-1', TZ)
    expect(charges.mockOrder).toHaveBeenCalledWith('period', { ascending: true })
  })

  it('should_map_and_resolve_rider_names_for_manager_role', async () => {
    makeManagerChain([{
      id: 'charge-1', agreement_id: 'agreement-1', period: calendarDate('2026-06-01'), fee: 200,
      agreements: { kind: 'lease', rider_id: 'rider-1' },
    }])
    vi.mocked(getOutstandingTransactionRows).mockResolvedValue(unpaidCharge('charge-1'))
    const result = await getOutstandingCharges('barn-1', TZ)
    expect(result).toEqual([{ id: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-06-01'), kind: 'lease', riderName: 'Alice Rider', fee: 200 }])
  })

  it('should_fall_back_to_rider_id_when_name_not_resolved', async () => {
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    makeManagerChain([{
      id: 'charge-1', agreement_id: 'agreement-1', period: calendarDate('2026-06-01'), fee: 200,
      agreements: { kind: 'board', rider_id: 'rider-9' },
    }])
    vi.mocked(getOutstandingTransactionRows).mockResolvedValue(unpaidCharge('charge-1'))
    const result = await getOutstandingCharges('barn-1', TZ)
    expect(result[0].riderName).toBe('rider-9')
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    makeManagerChain(null)
    const result = await getOutstandingCharges('barn-1', TZ)
    expect(result).toEqual([])
  })

  it('should_throw_when_charges_query_returns_an_error', async () => {
    makeManagerChain(null, new Error('db error'))
    await expect(getOutstandingCharges('barn-1', TZ)).rejects.toThrow('db error')
  })

  it('should_return_empty_array_when_rider_has_no_active_membership', async () => {
    const { from } = makeRiderChain({ membershipData: null })
    const result = await getOutstandingCharges('barn-1', TZ, 'user-rider', 'rider')
    expect(result).toEqual([])
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('should_throw_when_membership_lookup_errors', async () => {
    makeRiderChain({ membershipData: null, membershipError: new Error('membership error') })
    await expect(getOutstandingCharges('barn-1', TZ, 'user-rider', 'rider')).rejects.toThrow('membership error')
  })

  it('should_query_active_rider_membership_by_barn_and_user', async () => {
    const { membership } = makeRiderChain({ membershipData: { id: 'membership-1' } })
    await getOutstandingCharges('barn-1', TZ, 'user-rider', 'rider')
    expect(membership.mockEqUser).toHaveBeenCalledWith('user_id', 'user-rider')
    expect(membership.mockEqRole).toHaveBeenCalledWith('role', 'rider')
    expect(membership.mockEqStatus).toHaveBeenCalledWith('status', 'active')
  })

  it('should_return_empty_array_when_the_rider_has_no_agreements', async () => {
    const { from } = makeRiderChain({ membershipData: { id: 'membership-1' }, riderAgreementsData: [] })
    const result = await getOutstandingCharges('barn-1', TZ, 'user-rider', 'rider')
    expect(result).toEqual([])
    expect(from).not.toHaveBeenCalledWith('agreement_charges')
  })

  it('should_treat_a_null_rider_agreements_response_as_no_agreements', async () => {
    const { from } = makeRiderChain({ membershipData: { id: 'membership-1' }, riderAgreementsData: null })
    const result = await getOutstandingCharges('barn-1', TZ, 'user-rider', 'rider')
    expect(result).toEqual([])
    expect(from).not.toHaveBeenCalledWith('agreement_charges')
  })

  it('should_throw_when_the_riders_agreements_lookup_errors', async () => {
    makeRiderChain({ membershipData: { id: 'membership-1' }, riderAgreementsError: new Error('rider agreements error') })
    await expect(getOutstandingCharges('barn-1', TZ, 'user-rider', 'rider')).rejects.toThrow('rider agreements error')
  })

  it('should_filter_charges_by_the_riders_own_agreement_ids', async () => {
    const { charges } = makeRiderChain({
      membershipData: { id: 'membership-1' },
      riderAgreementsData: [{ id: 'agreement-1' }, { id: 'agreement-2' }],
    })
    await getOutstandingCharges('barn-1', TZ, 'user-rider', 'rider')
    expect(charges.mockIn).toHaveBeenCalledWith('agreement_id', ['agreement-1', 'agreement-2'])
  })

  it('should_return_charges_for_the_riders_own_agreements', async () => {
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['membership-1', 'Alice Rider']]))
    makeRiderChain({
      membershipData: { id: 'membership-1' },
      riderAgreementsData: [{ id: 'agreement-1' }],
      chargesData: [{
        id: 'charge-1', period: calendarDate('2026-06-01'), fee: 200,
        agreements: { kind: 'board', rider_id: 'membership-1' },
      }],
    })
    vi.mocked(getOutstandingTransactionRows).mockResolvedValue(unpaidCharge('charge-1'))
    const result = await getOutstandingCharges('barn-1', TZ, 'user-rider', 'rider')
    expect(result).toEqual([{ id: 'charge-1', period: calendarDate('2026-06-01'), kind: 'board', riderName: 'Alice Rider', fee: 200 }])
  })

  it('should_throw_when_rider_charges_query_errors', async () => {
    makeRiderChain({
      membershipData: { id: 'membership-1' },
      riderAgreementsData: [{ id: 'agreement-1' }],
      chargesError: new Error('charges error'),
    })
    await expect(getOutstandingCharges('barn-1', TZ, 'user-rider', 'rider')).rejects.toThrow('charges error')
  })
})
