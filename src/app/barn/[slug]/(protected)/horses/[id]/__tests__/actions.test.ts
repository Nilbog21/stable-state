import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/horses', () => ({
  updateHorseDetails: vi.fn(),
}))

vi.mock('@/lib/db/documents', () => ({
  deleteDocument: vi.fn(),
  updateDocumentReminderDate: vi.fn(),
}))

vi.mock('@/lib/db/document-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/document-storage')>()
  return { ...actual, removeFile: vi.fn() }
})

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { updateHorseDetails } from '@/lib/db/horses'
import { deleteDocument, updateDocumentReminderDate } from '@/lib/db/documents'
import { removeFile } from '@/lib/db/document-storage'
import { revalidatePath } from 'next/cache'
import {
  updateHorseAction,
  deleteHorseDocumentAction,
  updateHorseDocumentReminderDateAction,
} from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })

function validThresholdsFormData(): FormData {
  const fd = new FormData()
  fd.set('name', 'Stormy')
  fd.set('status', 'active')
  fd.set('moderate', '4')
  fd.set('high', '10')
  return fd
}

describe('updateHorseAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateHorseDetails).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateHorseDetails).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await updateHorseAction('green-acres', 'horse-1', { error: null }, validThresholdsFormData())
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_updateHorseDetails_with_active_updates_when_status_is_active', async () => {
    await updateHorseAction('green-acres', 'horse-1', { error: null }, validThresholdsFormData())
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, {
      name: 'Stormy',
      is_active: true,
      is_available: true,
      unavailability_reason: null,
      exhaustion_thresholds: { moderate: 4, high: 10 },
      feed_notes: null,
      medication_notes: null,
    })
  })

  it('should_call_updateHorseDetails_with_unavailable_updates_when_status_is_unavailable', async () => {
    const fd = validThresholdsFormData()
    fd.set('status', 'unavailable')
    fd.set('reason', 'stall rest')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, {
      name: 'Stormy',
      is_active: true,
      is_available: false,
      unavailability_reason: 'stall rest',
      exhaustion_thresholds: { moderate: 4, high: 10 },
      feed_notes: null,
      medication_notes: null,
    })
  })

  it('should_treat_empty_reason_as_null_when_status_is_unavailable', async () => {
    const fd = validThresholdsFormData()
    fd.set('status', 'unavailable')
    fd.set('reason', '   ')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, {
      name: 'Stormy',
      is_active: true,
      is_available: false,
      unavailability_reason: null,
      exhaustion_thresholds: { moderate: 4, high: 10 },
      feed_notes: null,
      medication_notes: null,
    })
  })

  it('should_call_updateHorseDetails_with_inactive_updates_when_status_is_inactive', async () => {
    const fd = validThresholdsFormData()
    fd.set('status', 'inactive')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, {
      name: 'Stormy',
      is_active: false,
      is_available: false,
      unavailability_reason: null,
      exhaustion_thresholds: { moderate: 4, high: 10 },
      feed_notes: null,
      medication_notes: null,
    })
  })

  it('should_call_updateHorseDetails_without_name_when_name_is_blank', async () => {
    const fd = validThresholdsFormData()
    fd.set('name', '   ')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, {
      is_active: true,
      is_available: true,
      unavailability_reason: null,
      exhaustion_thresholds: { moderate: 4, high: 10 },
      feed_notes: null,
      medication_notes: null,
    })
  })

  it('should_call_updateHorseDetails_without_name_when_name_field_is_absent', async () => {
    const fd = validThresholdsFormData()
    fd.delete('name')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, {
      is_active: true,
      is_available: true,
      unavailability_reason: null,
      exhaustion_thresholds: { moderate: 4, high: 10 },
      feed_notes: null,
      medication_notes: null,
    })
  })

  it('should_trim_name_before_calling_updateHorseDetails', async () => {
    const fd = validThresholdsFormData()
    fd.set('name', '  Stormy  ')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, {
      name: 'Stormy',
      is_active: true,
      is_available: true,
      unavailability_reason: null,
      exhaustion_thresholds: { moderate: 4, high: 10 },
      feed_notes: null,
      medication_notes: null,
    })
  })

  it('should_pass_feed_notes_and_medication_notes_to_updateHorseDetails', async () => {
    const fd = validThresholdsFormData()
    fd.set('feed_notes', '2 flakes hay AM/PM')
    fd.set('medication_notes', 'Bute 1g daily')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      feed_notes: '2 flakes hay AM/PM',
      medication_notes: 'Bute 1g daily',
    }))
  })

  it('should_trim_feed_notes_and_medication_notes_before_calling_updateHorseDetails', async () => {
    const fd = validThresholdsFormData()
    fd.set('feed_notes', '  2 flakes hay AM/PM  ')
    fd.set('medication_notes', '  Bute 1g daily  ')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      feed_notes: '2 flakes hay AM/PM',
      medication_notes: 'Bute 1g daily',
    }))
  })

  it('should_treat_blank_feed_notes_and_medication_notes_as_null', async () => {
    const fd = validThresholdsFormData()
    fd.set('feed_notes', '   ')
    fd.set('medication_notes', '   ')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      feed_notes: null,
      medication_notes: null,
    }))
  })

  it('should_treat_absent_feed_notes_and_medication_notes_fields_as_null', async () => {
    const fd = validThresholdsFormData()
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      feed_notes: null,
      medication_notes: null,
    }))
  })

  it('should_not_call_updateHorseDetails_when_status_is_invalid', async () => {
    const fd = validThresholdsFormData()
    fd.set('status', 'deleted')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).not.toHaveBeenCalled()
  })

  it('should_return_error_when_status_is_invalid', async () => {
    const fd = validThresholdsFormData()
    fd.set('status', 'deleted')
    const result = await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(result).toEqual({ error: 'invalid status' })
  })

  it('should_not_call_updateHorseDetails_when_status_is_absent', async () => {
    const fd = validThresholdsFormData()
    fd.delete('status')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).not.toHaveBeenCalled()
  })

  it('should_return_error_when_status_is_absent', async () => {
    const fd = validThresholdsFormData()
    fd.delete('status')
    const result = await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(result).toEqual({ error: 'invalid status' })
  })

  it('should_revalidate_horses_list_path', async () => {
    await updateHorseAction('green-acres', 'horse-1', { error: null }, validThresholdsFormData())
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })

  it('should_revalidate_horse_detail_path', async () => {
    await updateHorseAction('green-acres', 'horse-1', { error: null }, validThresholdsFormData())
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })

  it('should_return_null_error_on_success', async () => {
    const result = await updateHorseAction('green-acres', 'horse-1', { error: null }, validThresholdsFormData())
    expect(result).toEqual({ error: null })
  })

  it('should_call_updateHorseDetails_with_null_thresholds_when_use_barn_defaults_is_true', async () => {
    const fd = validThresholdsFormData()
    fd.set('use_barn_defaults', 'true')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      exhaustion_thresholds: null,
    }))
  })

  it('should_call_updateHorseDetails_with_parsed_thresholds_when_custom', async () => {
    const fd = validThresholdsFormData()
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      exhaustion_thresholds: { moderate: 4, high: 10 },
    }))
  })

  it('should_accept_zero_as_a_valid_moderate_value', async () => {
    const fd = validThresholdsFormData()
    fd.set('moderate', '0')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      exhaustion_thresholds: { moderate: 0, high: 10 },
    }))
  })

  it('should_return_error_when_moderate_is_blank', async () => {
    const fd = validThresholdsFormData()
    fd.set('moderate', '')
    const result = await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(result).toEqual({ error: 'Thresholds must be numbers ≥ 0' })
  })

  it('should_return_error_when_high_is_non_numeric', async () => {
    const fd = validThresholdsFormData()
    fd.set('high', 'abc')
    const result = await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(result).toEqual({ error: 'Thresholds must be numbers ≥ 0' })
  })

  it('should_return_error_when_moderate_has_trailing_non_digit_characters', async () => {
    const fd = validThresholdsFormData()
    fd.set('moderate', '4abc')
    const result = await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(result).toEqual({ error: 'Thresholds must be numbers ≥ 0' })
  })

  it('should_return_error_when_high_is_a_decimal', async () => {
    const fd = validThresholdsFormData()
    fd.set('high', '10.5')
    const result = await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(result).toEqual({ error: 'Thresholds must be numbers ≥ 0' })
  })

  it('should_not_call_updateHorseDetails_when_threshold_parsing_fails', async () => {
    const fd = validThresholdsFormData()
    fd.set('moderate', '')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).not.toHaveBeenCalled()
  })

  it('should_return_error_when_moderate_equals_high', async () => {
    const fd = validThresholdsFormData()
    fd.set('moderate', '10')
    fd.set('high', '10')
    const result = await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(result).toEqual({ error: 'Moderate threshold must be less than high threshold' })
  })

  it('should_return_error_when_moderate_is_greater_than_high', async () => {
    const fd = validThresholdsFormData()
    fd.set('moderate', '11')
    fd.set('high', '10')
    const result = await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(result).toEqual({ error: 'Moderate threshold must be less than high threshold' })
  })

  it('should_not_call_updateHorseDetails_when_moderate_gte_high', async () => {
    const fd = validThresholdsFormData()
    fd.set('moderate', '10')
    fd.set('high', '10')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).not.toHaveBeenCalled()
  })

  it('should_return_error_when_updateHorseDetails_fails', async () => {
    vi.mocked(updateHorseDetails).mockRejectedValue(new Error('details db error'))
    const result = await updateHorseAction('green-acres', 'horse-1', { error: null }, validThresholdsFormData())
    expect(result).toEqual({ error: 'details db error' })
  })

  it('should_not_revalidate_when_updateHorseDetails_fails', async () => {
    vi.mocked(updateHorseDetails).mockRejectedValue(new Error('details db error'))
    await updateHorseAction('green-acres', 'horse-1', { error: null }, validThresholdsFormData())
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

const mockBarnForDocs = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })

describe('deleteHorseDocumentAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(deleteDocument).mockReset()
    vi.mocked(removeFile).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(deleteDocument).mockResolvedValue(undefined)
    vi.mocked(removeFile).mockResolvedValue(undefined)
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarnForDocs,
      membership: managerMembership,
    })
  })

  it('should_call_requireMembership_with_manager_role_only', async () => {
    await deleteHorseDocumentAction('green-acres', 'horse-1', 'doc-1', 'barn-1/horses/horse-1/coggins.pdf')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_delete_document_record', async () => {
    await deleteHorseDocumentAction('green-acres', 'horse-1', 'doc-1', 'barn-1/horses/horse-1/coggins.pdf')
    expect(deleteDocument).toHaveBeenCalledWith('horse', 'doc-1', 'horse-1', mockBarnForDocs.id)
  })

  it('should_remove_storage_file', async () => {
    await deleteHorseDocumentAction('green-acres', 'horse-1', 'doc-1', 'barn-1/horses/horse-1/coggins.pdf')
    expect(removeFile).toHaveBeenCalledWith('barn-1/horses/horse-1/coggins.pdf')
  })

  it('should_revalidate_horse_detail_path', async () => {
    await deleteHorseDocumentAction('green-acres', 'horse-1', 'doc-1', 'barn-1/horses/horse-1/coggins.pdf')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })
})

describe('updateHorseDocumentReminderDateAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateDocumentReminderDate).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(updateDocumentReminderDate).mockResolvedValue(undefined)
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarnForDocs,
      membership: managerMembership,
    })
  })

  it('should_call_requireMembership_with_manager_role_only', async () => {
    await updateHorseDocumentReminderDateAction('green-acres', 'horse-1', 'doc-1', '2027-01-01')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_update_reminder_date', async () => {
    await updateHorseDocumentReminderDateAction('green-acres', 'horse-1', 'doc-1', '2027-01-01')
    expect(updateDocumentReminderDate).toHaveBeenCalledWith('horse', 'doc-1', 'horse-1', mockBarnForDocs.id, '2027-01-01')
  })

  it('should_clear_reminder_date_when_null', async () => {
    await updateHorseDocumentReminderDateAction('green-acres', 'horse-1', 'doc-1', null)
    expect(updateDocumentReminderDate).toHaveBeenCalledWith('horse', 'doc-1', 'horse-1', mockBarnForDocs.id, null)
  })

  it('should_revalidate_horse_detail_path', async () => {
    await updateHorseDocumentReminderDateAction('green-acres', 'horse-1', 'doc-1', '2027-01-01')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })

  it('should_return_null_error_on_success', async () => {
    const result = await updateHorseDocumentReminderDateAction('green-acres', 'horse-1', 'doc-1', '2027-01-01')
    expect(result).toEqual({ error: null })
  })

  it('should_return_error_when_db_update_fails', async () => {
    vi.mocked(updateDocumentReminderDate).mockRejectedValue(new Error('update error'))
    const result = await updateHorseDocumentReminderDateAction('green-acres', 'horse-1', 'doc-1', '2027-01-01')
    expect(result.error).toBe('update error')
  })
})
