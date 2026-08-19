import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockHorse } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('../document-storage', () => ({
  uploadFile: vi.fn(),
  removeFile: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createHorse, updateHorseDetails, updateHorseNotes } from '../horses'

describe('createHorse', () => {
  const newHorse = createMockHorse({ id: 'horse-3', name: 'Blaze', created_at: '2026-01-03', updated_at: '2026-01-03' })

  it('should_create_horse_in_barn', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: newHorse, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await createHorse('barn-1', 'Blaze', 'mem-1')

    expect(result).toEqual(newHorse)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
          }),
        }),
      }),
    } as any)

    await expect(createHorse('barn-1', 'Blaze', 'mem-1')).rejects.toThrow('db error')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const injectedClient = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: newHorse, error: null }),
          }),
        }),
      }),
    } as any

    await createHorse('barn-1', 'Blaze', 'mem-1', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_db_operation', async () => {
    vi.mocked(createClient).mockReset()
    const mockFrom = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: newHorse, error: null }),
        }),
      }),
    })
    const injectedClient = { from: mockFrom } as any

    await createHorse('barn-1', 'Blaze', 'mem-1', injectedClient)

    expect(mockFrom).toHaveBeenCalled()
  })

  it('should_insert_with_owning_member_id_when_provided', async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: newHorse, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert }),
    } as any)

    await createHorse('barn-1', 'Blaze', 'mem-1')

    expect(insert).toHaveBeenCalledWith({ barn_id: 'barn-1', name: 'Blaze', owning_member_id: 'mem-1' })
  })

  // #1549: the owner is a required argument, so there is no "omitted" case left to fall back
  // from. The column is NOT NULL and the type error at every call site is what enforces it.
  it('should_insert_the_owner_it_was_given_verbatim', async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: newHorse, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert }),
    } as any)

    await createHorse('barn-1', 'Blaze', 'mem-9')

    expect(insert).toHaveBeenCalledWith({ barn_id: 'barn-1', name: 'Blaze', owning_member_id: 'mem-9' })
  })
})


describe('updateHorseDetails', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_resolve_when_called_with_valid_updates', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await expect(updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: null, owning_member_id: 'mem-1' })).resolves.toBeUndefined()
  })

  it('should_call_rpc_with_correct_arguments', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { name: 'Blaze', is_active: false, is_available: false, unavailability_reason: 'stall rest', exhaustion_thresholds: { moderate: 4, high: 10 }, feed_notes: '2 flakes hay AM/PM', medication_notes: 'Bute 1g daily', registered_name: 'Blazing Comet', owning_member_id: 'mem-1' })
    expect(mockRpc).toHaveBeenCalledWith('update_horse_details', {
      p_horse_id: 'horse-1',
      p_barn_id: 'barn-1',
      p_name: 'Blaze',
      p_is_active: false,
      p_is_available: false,
      p_unavailability_reason: 'stall rest',
      p_exhaustion_threshold_moderate: 4,
      p_exhaustion_threshold_high: 10,
      p_feed_notes: '2 flakes hay AM/PM',
      p_medication_notes: 'Bute 1g daily',
      p_registered_name: 'Blazing Comet',
      p_owning_member_id: 'mem-1',
    })
  })

  it('should_pass_null_name_when_name_is_omitted', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: null, owning_member_id: 'mem-1' })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_name: null })
  })

  it('should_pass_null_thresholds_when_exhaustion_thresholds_is_null', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: null, owning_member_id: 'mem-1' })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_exhaustion_threshold_moderate: null, p_exhaustion_threshold_high: null })
  })

  it('should_pass_null_feed_and_medication_notes_when_omitted', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: null, owning_member_id: 'mem-1' })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_feed_notes: null, p_medication_notes: null })
  })

  it('should_pass_feed_and_medication_notes_as_given', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: '2 flakes hay AM/PM', medication_notes: 'Bute 1g daily', registered_name: null, owning_member_id: 'mem-1' })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_feed_notes: '2 flakes hay AM/PM', p_medication_notes: 'Bute 1g daily' })
  })

  it('should_pass_null_registered_name_when_omitted', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: null, owning_member_id: 'mem-1' })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_registered_name: null })
  })

  it('should_pass_registered_name_as_given', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: 'Four-Leaf Clover', owning_member_id: 'mem-1' })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_registered_name: 'Four-Leaf Clover' })
  })

  // #1549 dropped `should_pass_null_owning_member_id_when_omitted` alongside it: `owning_member_id`
  // is no longer nullable in this signature, so "omitted" is not a state a caller can reach.
  it('should_pass_owning_member_id_as_given', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: null, owning_member_id: 'mem-1' })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_owning_member_id: 'mem-1' })
  })

  it('should_throw_when_rpc_returns_an_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('db error') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await expect(updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: null, owning_member_id: 'mem-1' })).rejects.toThrow('db error')
  })
})

describe('updateHorseNotes', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_with_correct_arguments', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseNotes('horse-1', 'barn-1', { feed_notes: '2 flakes hay AM/PM', medication_notes: 'Bute 1g daily' })
    expect(mockRpc).toHaveBeenCalledWith('update_horse_notes', {
      p_horse_id: 'horse-1',
      p_barn_id: 'barn-1',
      p_feed_notes: '2 flakes hay AM/PM',
      p_medication_notes: 'Bute 1g daily',
    })
  })

  it('should_pass_null_notes_as_given', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseNotes('horse-1', 'barn-1', { feed_notes: null, medication_notes: null })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_feed_notes: null, p_medication_notes: null })
  })

  it('should_throw_when_rpc_returns_an_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('not_authorized') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await expect(updateHorseNotes('horse-1', 'barn-1', { feed_notes: null, medication_notes: null })).rejects.toThrow('not_authorized')
  })
})

