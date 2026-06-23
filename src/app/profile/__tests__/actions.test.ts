import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockProfile } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/profiles', () => ({
  getProfileByUserId: vi.fn(),
  updateProfile: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getProfileByUserId, updateProfile } from '@/lib/db/profiles'
import { updateProfileAction } from '../actions'

const mockProfile = createMockProfile()

function mockAuthUser(userId = 'user-1') {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
  } as any)
}

function mockAuthNoUser() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  } as any)
}

describe('updateProfileAction', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(getProfileByUserId).mockReset()
    vi.mocked(updateProfile).mockReset()
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
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAuthUser()
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    vi.mocked(updateProfile).mockRejectedValue(new Error('db error'))
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')

    const result = await updateProfileAction(form)

    expect(result).toEqual({ error: 'Failed to update profile' })
    vi.restoreAllMocks()
  })

  it('should_log_error_on_db_failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAuthUser()
    const dbError = new Error('db error')
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    vi.mocked(updateProfile).mockRejectedValue(dbError)
    const form = new FormData()
    form.set('first_name', 'Jane')
    form.set('last_name', 'Doe')

    await updateProfileAction(form)

    expect(spy).toHaveBeenCalledWith('updateProfileAction failed:', dbError)
    spy.mockRestore()
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
