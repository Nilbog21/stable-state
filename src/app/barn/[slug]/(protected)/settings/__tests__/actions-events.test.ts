import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockBarnEvent } from '@/test/fixtures'
import { makeFormData } from '@/test/utils/forms'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/lesson-tiers', () => ({
  createTier: vi.fn(),
  updateTier: vi.fn(),
  setDefaultTier: vi.fn(),
  getTierById: vi.fn(),
  deactivateTier: vi.fn(),
  reactivateTier: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  updateBarnDefaultBoardFee: vi.fn(),
  setInstructorCut: vi.fn(),
  updateExhaustionThresholds: vi.fn(),
  updateBarnTimezone: vi.fn(),
  updateScheduleBufferMinutes: vi.fn(),
}))

vi.mock('@/lib/db/barn-events', () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}))

vi.mock('@/lib/db/document-backup', () => ({
  buildDocumentsBackupZip: vi.fn(),
}))

vi.mock('@/lib/db/backup', () => ({
  buildBarnDataBackupBuffer: vi.fn(),
}))

vi.mock('@/lib/db/document-storage', () => ({
  uploadFile: vi.fn(),
  getSignedUrl: vi.fn(),
}))

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url}`,
    })
  })
)
vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { createEvent, updateEvent, deleteEvent } from '@/lib/db/barn-events'
import {
  createEventAction,
  updateEventAction,
  deleteEventAction,
} from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ role: 'manager', status: 'active' })

describe('createEventAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(createEvent).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(createEvent).mockResolvedValue(createMockBarnEvent())
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await expect(
      createEventAction('green-acres', { error: null }, makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_return_error_when_title_is_missing', async () => {
    const result = await createEventAction('green-acres', { error: null }, makeFormData({ event_at: '2026-10-31T22:00:00.000Z' }))

    expect(result.error).toBe('Title is required')
    expect(createEvent).not.toHaveBeenCalled()
  })

  it('should_return_error_when_event_at_is_missing', async () => {
    const result = await createEventAction('green-acres', { error: null }, makeFormData({ title: 'Costume Party' }))

    expect(result.error).toBe('Date is required')
    expect(createEvent).not.toHaveBeenCalled()
  })

  it('should_default_notes_to_null_when_blank', async () => {
    await expect(
      createEventAction('green-acres', { error: null }, makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createEvent).toHaveBeenCalledWith(mockBarn.id, expect.objectContaining({ notes: null }))
  })

  it('should_pass_trimmed_notes_when_present', async () => {
    await expect(
      createEventAction(
        'green-acres',
        { error: null },
        makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z', notes: '  Bring candy  ' })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createEvent).toHaveBeenCalledWith(mockBarn.id, expect.objectContaining({ notes: 'Bring candy' }))
  })

  it('should_filter_out_invalid_role_values_from_visible_to_roles', async () => {
    await expect(
      createEventAction(
        'green-acres',
        { error: null },
        makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z', visible_to_roles: ['manager', 'bogus'] })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createEvent).toHaveBeenCalledWith(mockBarn.id, expect.objectContaining({ visibleToRoles: ['manager'] }))
  })

  it('should_default_visible_to_roles_to_empty_array_when_none_submitted', async () => {
    await expect(
      createEventAction('green-acres', { error: null }, makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createEvent).toHaveBeenCalledWith(mockBarn.id, expect.objectContaining({ visibleToRoles: [] }))
  })

  it('should_redirect_to_settings_after_create', async () => {
    await expect(
      createEventAction('green-acres', { error: null }, makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings')
  })
})

describe('updateEventAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateEvent).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateEvent).mockResolvedValue(createMockBarnEvent())
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await expect(
      updateEventAction('green-acres', 'event-1', { error: null }, makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_return_error_when_title_is_missing', async () => {
    const result = await updateEventAction('green-acres', 'event-1', { error: null }, makeFormData({ event_at: '2026-10-31T22:00:00.000Z' }))

    expect(result.error).toBe('Title is required')
    expect(updateEvent).not.toHaveBeenCalled()
  })

  it('should_return_error_when_event_at_is_missing', async () => {
    const result = await updateEventAction('green-acres', 'event-1', { error: null }, makeFormData({ title: 'Costume Party' }))

    expect(result.error).toBe('Date is required')
    expect(updateEvent).not.toHaveBeenCalled()
  })

  it('should_call_updateEvent_with_event_id_and_barn_id', async () => {
    await expect(
      updateEventAction('green-acres', 'event-1', { error: null }, makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateEvent).toHaveBeenCalledWith('event-1', mockBarn.id, expect.objectContaining({ title: 'Costume Party' }))
  })

  it('should_redirect_to_settings_after_update', async () => {
    await expect(
      updateEventAction('green-acres', 'event-1', { error: null }, makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings')
  })
})

describe('deleteEventAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(deleteEvent).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(deleteEvent).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await expect(deleteEventAction('green-acres', 'event-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_deleteEvent_with_event_id_and_barn_id', async () => {
    await expect(deleteEventAction('green-acres', 'event-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(deleteEvent).toHaveBeenCalledWith('event-1', mockBarn.id)
  })

  it('should_redirect_to_settings_after_delete', async () => {
    await expect(deleteEventAction('green-acres', 'event-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings')
  })
})

