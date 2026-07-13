import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockProfile } from '@/test/fixtures'

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/db/profiles', () => ({
  getProfileByUserId: vi.fn(),
  updateProfile: vi.fn(),
}))

import { getAuthenticatedUser } from '@/lib/db/auth'
import { getProfileByUserId, updateProfile } from '@/lib/db/profiles'
import { updateProfileAction } from '../actions'

const mockProfile = createMockProfile()

function mockAuthUser(userId = 'user-1') {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: userId } as any)
}

function mockAuthNoUser() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
}

describe('updateProfileAction', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(getProfileByUserId).mockReset()
    vi.mocked(updateProfile).mockReset()
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('should_return_error_when_not_authenticated', async () => {
    mockAuthNoUser()
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')

    const result = await updateProfileAction(form)

    expect(result).toEqual({ error: 'not authenticated' })
  })

  it('should_return_error_when_first_name_is_blank', async () => {
    mockAuthUser()
    const form = new FormData()
    form.set('first_name', '  ')
    form.set('last_name', 'Doe')

    const result = await updateProfileAction(form)

    expect(result).toEqual({ error: 'first_name is required' })
  })

  it('should_return_error_when_first_name_is_missing_from_form', async () => {
    mockAuthUser()
    const form = new FormData()
    form.set('last_name', 'Doe')

    const result = await updateProfileAction(form)

    expect(result).toEqual({ error: 'first_name is required' })
  })

  it('should_return_error_when_last_name_is_blank', async () => {
    mockAuthUser()
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', '')

    const result = await updateProfileAction(form)

    expect(result).toEqual({ error: 'last_name is required' })
  })

  it('should_return_error_when_last_name_is_missing_from_form', async () => {
    mockAuthUser()
    const form = new FormData()
    form.set('first_name', 'Jane')

    const result = await updateProfileAction(form)

    expect(result).toEqual({ error: 'last_name is required' })
  })

  it('should_return_error_when_profile_not_found', async () => {
    mockAuthUser()
    vi.mocked(getProfileByUserId).mockResolvedValue(null)
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')

    const result = await updateProfileAction(form)

    expect(result).toEqual({ error: 'profile not found' })
  })

  it('should_call_updateProfile_with_correct_fields', async () => {
    mockAuthUser()
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    vi.mocked(updateProfile).mockResolvedValue(undefined)
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')
    form.set('phone', '555-1234')
    form.set('emergency_contact_name', 'Bob')
    form.set('emergency_contact_phone', '555-5678')

    await updateProfileAction(form)

    expect(updateProfile).toHaveBeenCalledWith('profile-1', {
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '555-1234',
      emergency_contact_name: 'Bob',
      emergency_contact_phone: '555-5678',
    })
  })

  it('should_return_null_error_on_success', async () => {
    mockAuthUser()
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    vi.mocked(updateProfile).mockResolvedValue(undefined)
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')

    const result = await updateProfileAction(form)

    expect(result).toEqual({ error: null })
  })

  it('should_return_error_on_db_failure', async () => {
    mockAuthUser()
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    vi.mocked(updateProfile).mockRejectedValue(new Error('db error'))
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')

    const result = await updateProfileAction(form)

    expect(result).toEqual({ error: 'Failed to update profile' })
  })

  it('should_log_error_on_db_failure', async () => {
    mockAuthUser()
    const dbError = new Error('db error')
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    vi.mocked(updateProfile).mockRejectedValue(dbError)
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')

    await updateProfileAction(form)

    expect(consoleSpy).toHaveBeenCalledWith('updateProfileAction failed:', dbError)
  })

  it('should_return_error_when_phone_is_invalid', async () => {
    mockAuthUser()
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')
    form.set('phone', '555-CALL-NOW')

    const result = await updateProfileAction(form)

    expect(result).toEqual({ error: 'Phone number must contain 7–15 digits' })
  })

  it('should_not_call_updateProfile_when_phone_is_invalid', async () => {
    mockAuthUser()
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')
    form.set('phone', '555-CALL-NOW')

    await updateProfileAction(form)

    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('should_return_error_when_emergency_contact_phone_is_invalid', async () => {
    mockAuthUser()
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')
    form.set('emergency_contact_phone', '123')

    const result = await updateProfileAction(form)

    expect(result).toEqual({ error: 'Emergency contact phone must contain 7–15 digits' })
  })

  it('should_not_call_updateProfile_when_emergency_contact_phone_is_invalid', async () => {
    mockAuthUser()
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')
    form.set('emergency_contact_phone', '123')

    await updateProfileAction(form)

    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('should_allow_save_when_phone_is_unchanged_legacy_format', async () => {
    mockAuthUser()
    vi.mocked(getProfileByUserId).mockResolvedValue(
      createMockProfile({ phone: '555-123-4567 x205' })
    )
    vi.mocked(updateProfile).mockResolvedValue(undefined)
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')
    form.set('phone', '555-123-4567 x205')

    const result = await updateProfileAction(form)

    expect(result).toEqual({ error: null })
  })

  it('should_allow_save_when_emergency_contact_phone_is_unchanged_legacy_format', async () => {
    mockAuthUser()
    vi.mocked(getProfileByUserId).mockResolvedValue(
      createMockProfile({ emergency_contact_phone: '212.555.0123' })
    )
    vi.mocked(updateProfile).mockResolvedValue(undefined)
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')
    form.set('emergency_contact_phone', '212.555.0123')

    const result = await updateProfileAction(form)

    expect(result).toEqual({ error: null })
  })

  it('should_pass_null_for_empty_optional_fields', async () => {
    mockAuthUser()
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    vi.mocked(updateProfile).mockResolvedValue(undefined)
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')
    form.set('phone', '')
    form.set('emergency_contact_name', '')
    form.set('emergency_contact_phone', '')

    await updateProfileAction(form)

    expect(updateProfile).toHaveBeenCalledWith('profile-1', {
      first_name: 'Jane',
      last_name: 'Doe',
      phone: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
    })
  })
})
