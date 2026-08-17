import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockMemberHorsePrivilege, createMockHorse } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/horses', () => ({
  getHorseById: vi.fn(),
  updateHorseDetails: vi.fn(),
  updateHorseNotes: vi.fn(),
  replaceHorsePhoto: vi.fn(),
  removeHorsePhoto: vi.fn(),
}))

vi.mock('@/lib/db/member-horse-privileges', () => ({
  grantHorsePrivilege: vi.fn(),
  updateHorsePrivilegeDocumentAccess: vi.fn(),
  updateHorsePrivilegeLessonAccess: vi.fn(),
  revokeHorsePrivilege: vi.fn(),
  setHorseOwner: vi.fn(),
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

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
const mockNotFound = vi.hoisted(() => vi.fn(() => {
  throw Object.assign(new Error('NEXT_NOT_FOUND'), { digest: 'NEXT_NOT_FOUND' })
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect, notFound: mockNotFound }))

import { requireMembership } from '@/lib/auth/guard'
import { getHorseById, updateHorseDetails, updateHorseNotes, replaceHorsePhoto, removeHorsePhoto } from '@/lib/db/horses'
import {
  grantHorsePrivilege,
  updateHorsePrivilegeDocumentAccess,
  updateHorsePrivilegeLessonAccess,
  revokeHorsePrivilege,
  setHorseOwner,
} from '@/lib/db/member-horse-privileges'
import { deleteDocument, updateDocumentReminderDate } from '@/lib/db/documents'
import { removeFile } from '@/lib/db/document-storage'
import { revalidatePath } from 'next/cache'
import {
  updateHorseAction,
  deleteHorseDocumentAction,
  updateHorseDocumentReminderDateAction,
  uploadHorsePhotoAction,
  deleteHorsePhotoAction,
  grantHorseAccessAction,
  updateHorseAccessDocumentAction,
  updateHorseAccessLessonAction,
  revokeHorseAccessAction,
  setHorseOwnerAction,
  updateHorseNotesAction,
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
    vi.mocked(getHorseById).mockReset()
    vi.mocked(updateHorseDetails).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({ id: 'horse-1', owning_member_id: null }))
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
      registered_name: null,
      owning_member_id: null,
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
      registered_name: null,
      owning_member_id: null,
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
      registered_name: null,
      owning_member_id: null,
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
      registered_name: null,
      owning_member_id: null,
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
      registered_name: null,
      owning_member_id: null,
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
      registered_name: null,
      owning_member_id: null,
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
      registered_name: null,
      owning_member_id: null,
    })
  })

  // #1390 moved feed/medication out of HorseManagerForm and into its own Feed & Medication
  // section, which saves through update_horse_notes. This form no longer carries the fields,
  // so it re-sends the horse's stored values -- the same pass-through already used for
  // owning_member_id, and the reason the 12-param update_horse_details signature is untouched.
  it('should_pass_the_horses_stored_notes_through_to_updateHorseDetails', async () => {
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({
      id: 'horse-1',
      owning_member_id: null,
      feed_notes: '2 flakes hay AM/PM',
      medication_notes: 'Bute 1g daily',
    }))
    await updateHorseAction('green-acres', 'horse-1', { error: null }, validThresholdsFormData())
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      feed_notes: '2 flakes hay AM/PM',
      medication_notes: 'Bute 1g daily',
    }))
  })

  it('should_ignore_notes_submitted_in_the_form_data', async () => {
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({
      id: 'horse-1',
      owning_member_id: null,
      feed_notes: 'stored feed',
      medication_notes: 'stored meds',
    }))
    const fd = validThresholdsFormData()
    fd.set('feed_notes', 'submitted feed')
    fd.set('medication_notes', 'submitted meds')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      feed_notes: 'stored feed',
      medication_notes: 'stored meds',
    }))
  })

  it('should_pass_registered_name_to_updateHorseDetails', async () => {
    const fd = validThresholdsFormData()
    fd.set('registered_name', 'Four-Leaf Clover')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      registered_name: 'Four-Leaf Clover',
    }))
  })

  it('should_trim_registered_name_before_calling_updateHorseDetails', async () => {
    const fd = validThresholdsFormData()
    fd.set('registered_name', '  Four-Leaf Clover  ')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      registered_name: 'Four-Leaf Clover',
    }))
  })

  it('should_treat_blank_registered_name_as_null', async () => {
    const fd = validThresholdsFormData()
    fd.set('registered_name', '   ')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      registered_name: null,
    }))
  })

  it('should_treat_absent_registered_name_field_as_null', async () => {
    const fd = validThresholdsFormData()
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      registered_name: null,
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

  it('should_preserve_the_horses_current_owner_when_saving_other_fields', async () => {
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({ id: 'horse-1', owning_member_id: 'mem-existing-owner' }))
    await updateHorseAction('green-acres', 'horse-1', { error: null }, validThresholdsFormData())
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      owning_member_id: 'mem-existing-owner',
    }))
  })

  it('should_ignore_an_owning_member_id_field_in_form_data', async () => {
    vi.mocked(getHorseById).mockResolvedValue(createMockHorse({ id: 'horse-1', owning_member_id: 'mem-existing-owner' }))
    const fd = validThresholdsFormData()
    fd.set('owning_member_id', 'mem-attacker-supplied')
    await updateHorseAction('green-acres', 'horse-1', { error: null }, fd)
    expect(updateHorseDetails).toHaveBeenCalledWith('horse-1', mockBarn.id, expect.objectContaining({
      owning_member_id: 'mem-existing-owner',
    }))
  })

  it('should_return_error_when_horse_is_not_found', async () => {
    vi.mocked(getHorseById).mockResolvedValue(null)
    const result = await updateHorseAction('green-acres', 'horse-1', { error: null }, validThresholdsFormData())
    expect(result).toEqual({ error: 'Horse not found' })
  })

  it('should_not_call_updateHorseDetails_when_horse_is_not_found', async () => {
    vi.mocked(getHorseById).mockResolvedValue(null)
    await updateHorseAction('green-acres', 'horse-1', { error: null }, validThresholdsFormData())
    expect(updateHorseDetails).not.toHaveBeenCalled()
  })
})

describe('updateHorseNotesAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateHorseNotes).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(updateHorseNotes).mockResolvedValue(undefined)
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: createMockMembership({ id: 'mem-owner', role: 'rider' }),
    })
  })

  function notesFormData(feedNotes = '2 flakes hay AM/PM', medicationNotes = 'Bute 1g daily'): FormData {
    const fd = new FormData()
    fd.set('feed_notes', feedNotes)
    fd.set('medication_notes', medicationNotes)
    return fd
  }

  it('should_call_requireMembership_with_all_roles', async () => {
    await updateHorseNotesAction('green-acres', 'horse-1', { error: null }, notesFormData())
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager', 'trainer', 'rider'])
  })

  it('should_call_updateHorseNotes_with_barn_scoped_ids_and_notes', async () => {
    await updateHorseNotesAction('green-acres', 'horse-1', { error: null }, notesFormData())
    expect(updateHorseNotes).toHaveBeenCalledWith('horse-1', mockBarn.id, {
      feed_notes: '2 flakes hay AM/PM',
      medication_notes: 'Bute 1g daily',
    })
  })

  // #1390 routes the manager's Feed & Medication save through here too, rather than through
  // HorseManagerForm's update_horse_details. The action was already role-agnostic; the manager
  // branch it now needs lives in the update_horse_notes RPC, not here.
  it('should_call_updateHorseNotes_for_a_manager_too', async () => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    await updateHorseNotesAction('green-acres', 'horse-1', { error: null }, notesFormData())
    expect(updateHorseNotes).toHaveBeenCalledWith('horse-1', mockBarn.id, {
      feed_notes: '2 flakes hay AM/PM',
      medication_notes: 'Bute 1g daily',
    })
  })

  it('should_treat_blank_notes_as_null', async () => {
    await updateHorseNotesAction('green-acres', 'horse-1', { error: null }, notesFormData('   ', '   '))
    expect(updateHorseNotes).toHaveBeenCalledWith('horse-1', mockBarn.id, {
      feed_notes: null,
      medication_notes: null,
    })
  })

  it('should_revalidate_horse_detail_path_on_success', async () => {
    await updateHorseNotesAction('green-acres', 'horse-1', { error: null }, notesFormData())
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })

  it('should_return_null_error_on_success', async () => {
    const result = await updateHorseNotesAction('green-acres', 'horse-1', { error: null }, notesFormData())
    expect(result).toEqual({ error: null })
  })

  it('should_return_error_when_updateHorseNotes_is_not_authorized', async () => {
    vi.mocked(updateHorseNotes).mockRejectedValue(new Error('not_authorized'))
    const result = await updateHorseNotesAction('green-acres', 'horse-1', { error: null }, notesFormData())
    expect(result).toEqual({ error: 'not_authorized' })
  })

  it('should_not_revalidate_when_updateHorseNotes_fails', async () => {
    vi.mocked(updateHorseNotes).mockRejectedValue(new Error('not_authorized'))
    await updateHorseNotesAction('green-acres', 'horse-1', { error: null }, notesFormData())
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

  // #1547: any active role, because the caller may be the horse's owning member whatever their
  // role. The horse_documents DELETE policy is the boundary -- an unowning rider's call deletes
  // zero rows rather than being refused here.
  it('should_call_requireMembership_with_all_active_roles', async () => {
    await deleteHorseDocumentAction('green-acres', 'horse-1', 'doc-1', 'barn-1/horses/horse-1/coggins.pdf')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager', 'trainer', 'rider'])
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

function makePhotoFile(): File {
  return new File([new Uint8Array(100)], 'butter.jpg', { type: 'image/jpeg' })
}

describe('uploadHorsePhotoAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(replaceHorsePhoto).mockReset()
    vi.mocked(revalidatePath).mockReset()
    mockRedirect.mockClear()

    vi.mocked(replaceHorsePhoto).mockResolvedValue(undefined)
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarnForDocs,
      membership: managerMembership,
    })
  })

  function formDataWithFile(): FormData {
    const fd = new FormData()
    fd.set('file', makePhotoFile())
    return fd
  }

  it('should_call_requireMembership_with_all_roles', async () => {
    await uploadHorsePhotoAction('green-acres', 'horse-1', { error: null }, formDataWithFile()).catch(() => {})
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager', 'trainer', 'rider'])
  })

  it('should_return_error_when_file_type_is_not_jpeg_or_png', async () => {
    const fd = new FormData()
    fd.set('file', new File([new Uint8Array(100)], 'doc.pdf', { type: 'application/pdf' }))
    const result = await uploadHorsePhotoAction('green-acres', 'horse-1', { error: null }, fd)
    expect(result).toEqual({ error: 'Unsupported file type' })
  })

  it('should_not_call_replaceHorsePhoto_when_file_type_is_invalid', async () => {
    const fd = new FormData()
    fd.set('file', new File([new Uint8Array(100)], 'doc.pdf', { type: 'application/pdf' }))
    await uploadHorsePhotoAction('green-acres', 'horse-1', { error: null }, fd)
    expect(replaceHorsePhoto).not.toHaveBeenCalled()
  })

  it('should_call_replaceHorsePhoto_with_barn_scoped_ids_file_and_extension', async () => {
    await uploadHorsePhotoAction('green-acres', 'horse-1', { error: null }, formDataWithFile()).catch(() => {})
    expect(replaceHorsePhoto).toHaveBeenCalledWith('horse-1', mockBarnForDocs.id, expect.any(File), 'jpg')
  })

  it('should_revalidate_horse_detail_path', async () => {
    await uploadHorsePhotoAction('green-acres', 'horse-1', { error: null }, formDataWithFile()).catch(() => {})
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })

  it('should_redirect_to_horse_detail_page_on_success', async () => {
    await expect(uploadHorsePhotoAction('green-acres', 'horse-1', { error: null }, formDataWithFile())).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })

  it('should_return_error_when_replaceHorsePhoto_fails', async () => {
    vi.mocked(replaceHorsePhoto).mockRejectedValue(new Error('upload error'))
    const result = await uploadHorsePhotoAction('green-acres', 'horse-1', { error: null }, formDataWithFile())
    expect(result).toEqual({ error: 'upload error' })
  })

  it('should_not_revalidate_when_replaceHorsePhoto_fails', async () => {
    vi.mocked(replaceHorsePhoto).mockRejectedValue(new Error('upload error'))
    await uploadHorsePhotoAction('green-acres', 'horse-1', { error: null }, formDataWithFile())
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('deleteHorsePhotoAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(removeHorsePhoto).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(removeHorsePhoto).mockResolvedValue(undefined)
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarnForDocs,
      membership: managerMembership,
    })
  })

  it('should_call_requireMembership_with_all_roles', async () => {
    await deleteHorsePhotoAction('green-acres', 'horse-1')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager', 'trainer', 'rider'])
  })

  it('should_call_removeHorsePhoto_with_barn_scoped_ids', async () => {
    await deleteHorsePhotoAction('green-acres', 'horse-1')
    expect(removeHorsePhoto).toHaveBeenCalledWith('horse-1', mockBarnForDocs.id)
  })

  it('should_revalidate_horse_detail_path', async () => {
    await deleteHorsePhotoAction('green-acres', 'horse-1')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })

  it('should_not_throw_when_removeHorsePhoto_is_not_authorized', async () => {
    vi.mocked(removeHorsePhoto).mockRejectedValue(new Error('not_authorized'))
    await expect(deleteHorsePhotoAction('green-acres', 'horse-1')).resolves.toBeUndefined()
  })

  it('should_still_revalidate_when_removeHorsePhoto_is_not_authorized', async () => {
    vi.mocked(removeHorsePhoto).mockRejectedValue(new Error('not_authorized'))
    await deleteHorsePhotoAction('green-acres', 'horse-1')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })
})

describe('grantHorseAccessAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(grantHorsePrivilege).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(grantHorsePrivilege).mockResolvedValue(createMockMemberHorsePrivilege())
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarnForDocs,
      membership: managerMembership,
    })
  })

  // #1390: takes FormData rather than a memberId argument, because the member is chosen from a
  // <select> inside the form -- the value isn't known at render time, so it can't be `.bind()`'d,
  // and a closure over client state is exactly what defeats progressive enhancement (#1385).
  function grantFormData(memberId: string): FormData {
    const fd = new FormData()
    fd.set('member_id', memberId)
    return fd
  }

  it('should_call_requireMembership_with_manager_role_only', async () => {
    await grantHorseAccessAction('green-acres', 'horse-1', grantFormData('mem-rider-1'))
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_grant_privilege_for_selected_member', async () => {
    await grantHorseAccessAction('green-acres', 'horse-1', grantFormData('mem-rider-1'))
    expect(grantHorsePrivilege).toHaveBeenCalledWith('horse-1', mockBarnForDocs.id, 'mem-rider-1')
  })

  it('should_revalidate_horse_detail_path', async () => {
    await grantHorseAccessAction('green-acres', 'horse-1', grantFormData('mem-rider-1'))
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })

  // The select's placeholder option submits an empty value, and pre-hydration there is no
  // disabled-until-chosen button to stop it reaching the server.
  it('should_not_grant_a_privilege_when_no_member_was_selected', async () => {
    await grantHorseAccessAction('green-acres', 'horse-1', grantFormData(''))
    expect(grantHorsePrivilege).not.toHaveBeenCalled()
  })

  it('should_not_revalidate_when_no_member_was_selected', async () => {
    await grantHorseAccessAction('green-acres', 'horse-1', grantFormData(''))
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('should_not_grant_a_privilege_when_the_member_id_field_is_absent', async () => {
    await grantHorseAccessAction('green-acres', 'horse-1', new FormData())
    expect(grantHorsePrivilege).not.toHaveBeenCalled()
  })
})

describe('updateHorseAccessDocumentAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateHorsePrivilegeDocumentAccess).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(updateHorsePrivilegeDocumentAccess).mockResolvedValue(undefined)
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarnForDocs,
      membership: managerMembership,
    })
  })

  it('should_call_requireMembership_with_manager_role_only', async () => {
    await updateHorseAccessDocumentAction('green-acres', 'horse-1', 'privilege-1', 'write')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_update_document_privileges_for_the_grant', async () => {
    await updateHorseAccessDocumentAction('green-acres', 'horse-1', 'privilege-1', 'write')
    expect(updateHorsePrivilegeDocumentAccess).toHaveBeenCalledWith('privilege-1', mockBarnForDocs.id, 'write')
  })

  it('should_revalidate_horse_detail_path', async () => {
    await updateHorseAccessDocumentAction('green-acres', 'horse-1', 'privilege-1', 'read')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })

  // A Server Action argument is deserialized from whatever the client posted, so the union type
  // is a compile-time claim and not a runtime one -- hence the enum check the caller can't skip.
  it('should_not_update_privileges_for_a_value_outside_the_enum', async () => {
    await updateHorseAccessDocumentAction('green-acres', 'horse-1', 'privilege-1', 'admin' as never)
    expect(updateHorsePrivilegeDocumentAccess).not.toHaveBeenCalled()
  })

  it('should_not_revalidate_for_a_value_outside_the_enum', async () => {
    await updateHorseAccessDocumentAction('green-acres', 'horse-1', 'privilege-1', 'admin' as never)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('should_not_update_privileges_when_the_value_is_absent', async () => {
    await updateHorseAccessDocumentAction('green-acres', 'horse-1', 'privilege-1', undefined as never)
    expect(updateHorsePrivilegeDocumentAccess).not.toHaveBeenCalled()
  })

  it('should_accept_none_as_a_valid_value', async () => {
    await updateHorseAccessDocumentAction('green-acres', 'horse-1', 'privilege-1', 'none')
    expect(updateHorsePrivilegeDocumentAccess).toHaveBeenCalledWith('privilege-1', mockBarnForDocs.id, 'none')
  })
})

describe('updateHorseAccessLessonAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateHorsePrivilegeLessonAccess).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(updateHorsePrivilegeLessonAccess).mockResolvedValue(undefined)
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarnForDocs,
      membership: managerMembership,
    })
  })

  it('should_call_requireMembership_with_manager_role_only', async () => {
    await updateHorseAccessLessonAction('green-acres', 'horse-1', 'privilege-1', true)
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_update_lesson_read_privileges_for_the_grant', async () => {
    await updateHorseAccessLessonAction('green-acres', 'horse-1', 'privilege-1', true)
    expect(updateHorsePrivilegeLessonAccess).toHaveBeenCalledWith('privilege-1', mockBarnForDocs.id, true)
  })

  it('should_revalidate_horse_detail_path', async () => {
    await updateHorseAccessLessonAction('green-acres', 'horse-1', 'privilege-1', false)
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })
})

describe('revokeHorseAccessAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(revokeHorsePrivilege).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(revokeHorsePrivilege).mockResolvedValue(undefined)
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarnForDocs,
      membership: managerMembership,
    })
  })

  it('should_call_requireMembership_with_manager_role_only', async () => {
    await revokeHorseAccessAction('green-acres', 'horse-1', 'privilege-1')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_revoke_the_privilege_grant', async () => {
    await revokeHorseAccessAction('green-acres', 'horse-1', 'privilege-1')
    expect(revokeHorsePrivilege).toHaveBeenCalledWith('privilege-1', mockBarnForDocs.id)
  })

  it('should_revalidate_horse_detail_path', async () => {
    await revokeHorseAccessAction('green-acres', 'horse-1', 'privilege-1')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })
})

describe('setHorseOwnerAction', () => {
  const existingHorse = createMockHorse({ id: 'horse-1', owning_member_id: null })

  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getHorseById).mockReset()
    vi.mocked(setHorseOwner).mockReset()
    vi.mocked(revalidatePath).mockReset()
    mockNotFound.mockClear()

    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarnForDocs,
      membership: managerMembership,
    })
    vi.mocked(getHorseById).mockResolvedValue(existingHorse)
    vi.mocked(setHorseOwner).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role_only', async () => {
    await setHorseOwnerAction('green-acres', 'horse-1', 'mem-rider-1')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_setHorseOwner_with_the_new_owner', async () => {
    await setHorseOwnerAction('green-acres', 'horse-1', 'mem-rider-1')
    expect(setHorseOwner).toHaveBeenCalledWith('horse-1', mockBarnForDocs.id, 'mem-rider-1')
  })

  it('should_call_setHorseOwner_with_null_when_clearing_ownership', async () => {
    await setHorseOwnerAction('green-acres', 'horse-1', null)
    expect(setHorseOwner).toHaveBeenCalledWith('horse-1', mockBarnForDocs.id, null)
  })

  it('should_revalidate_horse_detail_path', async () => {
    await setHorseOwnerAction('green-acres', 'horse-1', 'mem-rider-1')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })

  it('should_call_notFound_when_horse_is_not_found', async () => {
    vi.mocked(getHorseById).mockResolvedValue(null)
    await expect(setHorseOwnerAction('green-acres', 'horse-1', 'mem-rider-1')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })
})
