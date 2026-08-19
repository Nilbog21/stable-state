import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockProfile } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('../document-storage', () => ({
  uploadFile: vi.fn(),
  removeFile: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { uploadFile, removeFile } from '../document-storage'
import { upsertProfile, getProfilesByUserIds, updateContactInfo, getProfileByUserId, getProfileById, updateProfile, updateProfilePhotoPath, replaceProfilePhoto, removeProfilePhoto, markProfileAsDemo } from '../profiles'

const mockProfile = createMockProfile()

function makeSupabaseMock(returnData: unknown, returnError: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data: returnData, error: returnError })
  const select = vi.fn().mockReturnValue({ single })
  const upsert = vi.fn().mockReturnValue({ select })
  return {
    from: vi.fn().mockReturnValue({ upsert }),
    _mocks: { upsert, select, single },
  }
}

describe('upsertProfile', () => {
  it('should_call_from_profiles_table', async () => {
    const mock = makeSupabaseMock(mockProfile)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    await upsertProfile('user-1', 'test@example.com', 'Jane', 'Doe')

    expect(mock.from).toHaveBeenCalledWith('profiles')
  })

  it('should_upsert_with_correct_payload', async () => {
    const mock = makeSupabaseMock(mockProfile)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    await upsertProfile('user-1', 'test@example.com', 'Jane', 'Doe')

    expect(mock._mocks.upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', email: 'test@example.com', first_name: 'Jane', last_name: 'Doe' },
      { onConflict: 'user_id' }
    )
  })

  it('should_return_upserted_profile', async () => {
    const mock = makeSupabaseMock(mockProfile)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    const result = await upsertProfile('user-1', 'test@example.com', 'Jane', 'Doe')

    expect(result).toEqual(mockProfile)
  })

  it('should_throw_when_data_is_null', async () => {
    const mock = makeSupabaseMock(null)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    await expect(upsertProfile('user-1', 'test@example.com', 'Jane', 'Doe')).rejects.toThrow('upsert returned no row')
  })

  it('should_update_existing_profile_on_conflict', async () => {
    const updated = createMockProfile({ first_name: 'Janet' })
    const mock = makeSupabaseMock(updated)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    const result = await upsertProfile('user-1', 'test@example.com', 'Janet', 'Doe')

    expect(result).toEqual(updated)
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = { message: 'unique constraint violation', code: '23505' }
    const mock = makeSupabaseMock(null, dbError)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    await expect(upsertProfile('user-1', 'test@example.com', 'Jane', 'Doe')).rejects.toEqual(dbError)
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const injectedClient = {
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      }),
    } as any

    await upsertProfile('user-1', 'test@example.com', 'Jane', 'Doe', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_db_operation', async () => {
    vi.mocked(createClient).mockReset()
    const mockFrom = vi.fn().mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
        }),
      }),
    })
    const injectedClient = { from: mockFrom } as any

    await upsertProfile('user-1', 'test@example.com', 'Jane', 'Doe', injectedClient)

    expect(mockFrom).toHaveBeenCalled()
  })
})

const mockProfiles = [
  createMockProfile({ user_id: 'user-1', first_name: 'Jane', last_name: 'Doe' }),
  createMockProfile({ user_id: 'user-2', first_name: 'John', last_name: 'Smith' }),
]

describe('getProfilesByUserIds', () => {
  it('should_return_profiles_for_given_user_ids', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: mockProfiles, error: null }),
        }),
      }),
    } as any)

    const result = await getProfilesByUserIds(['user-1', 'user-2'])

    expect(result).toEqual(mockProfiles)
  })

  it('should_return_empty_array_for_empty_input', async () => {
    const result = await getProfilesByUserIds([])

    expect(result).toEqual([])
  })

  it('should_query_profiles_by_user_id_in_list', async () => {
    const mockIn = vi.fn().mockResolvedValue({ data: mockProfiles, error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ in: mockIn }),
      }),
    } as any)

    await getProfilesByUserIds(['user-1', 'user-2'])

    expect(mockIn).toHaveBeenCalledWith('user_id', ['user-1', 'user-2'])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('query failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: null, error: dbError }),
        }),
      }),
    } as any)

    await expect(getProfilesByUserIds(['user-1'])).rejects.toThrow('query failed')
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    } as any)

    const result = await getProfilesByUserIds(['user-1'])

    expect(result).toEqual([])
  })
})

describe('getProfileByUserId', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_profile_when_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getProfileByUserId('user-1')

    expect(result).toEqual(mockProfile)
  })

  it('should_return_null_when_not_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getProfileByUserId('user-999')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('query failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: dbError }),
          }),
        }),
      }),
    } as any)

    await expect(getProfileByUserId('user-1')).rejects.toThrow('query failed')
  })

  it('should_query_by_user_id', async () => {
    const mockEq = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: mockEq }),
      }),
    } as any)

    await getProfileByUserId('user-42')

    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-42')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      }),
    } as any

    const result = await getProfileByUserId('user-1', mockClient)

    expect(result).toEqual(mockProfile)
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('getProfileById', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_profile_when_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getProfileById('profile-1')

    expect(result).toEqual(mockProfile)
  })

  it('should_return_null_when_not_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getProfileById('profile-999')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('query failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: dbError }),
          }),
        }),
      }),
    } as any)

    await expect(getProfileById('profile-1')).rejects.toThrow('query failed')
  })

  it('should_query_by_id', async () => {
    const mockEq = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: mockEq }),
      }),
    } as any)

    await getProfileById('profile-42')

    expect(mockEq).toHaveBeenCalledWith('id', 'profile-42')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const injectedClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      }),
    } as any

    await getProfileById('profile-1', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_db_operation', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
        }),
      }),
    })
    const injectedClient = { from: mockFrom } as any

    await getProfileById('profile-1', injectedClient)

    expect(mockFrom).toHaveBeenCalledWith('profiles')
  })
})

describe('updateProfile', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_update_all_profile_fields', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await updateProfile('profile-1', {
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '555-1234',
      emergency_contact_name: 'Bob',
      emergency_contact_phone: '555-5678',
    })

    expect(mockUpdate).toHaveBeenCalledWith({
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '555-1234',
      emergency_contact_name: 'Bob',
      emergency_contact_phone: '555-5678',
    })
  })

  it('should_filter_by_profile_id', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: mockEq }),
      }),
    } as any)

    await updateProfile('profile-99', { first_name: 'Jane', last_name: 'Doe' })

    expect(mockEq).toHaveBeenCalledWith('id', 'profile-99')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('update failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: dbError }),
        }),
      }),
    } as any)

    await expect(updateProfile('profile-1', { first_name: 'Jane', last_name: 'Doe' })).rejects.toThrow('update failed')
  })
})

describe('updateContactInfo', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_update_with_contact_fields', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await updateContactInfo('profile-1', { phone: '555-1234' })

    expect(mockUpdate).toHaveBeenCalledWith({ phone: '555-1234' })
  })

  it('should_filter_by_profile_id', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await updateContactInfo('profile-99', { emergency_contact_name: 'Jane' })

    expect(mockEq).toHaveBeenCalledWith('id', 'profile-99')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('update failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: dbError }),
        }),
      }),
    } as any)

    await expect(updateContactInfo('profile-1', { phone: '555-0000' })).rejects.toThrow('update failed')
  })

  it('should_use_injected_client_without_calling_createClient', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    const injectedClient = { from: vi.fn().mockReturnValue({ update: mockUpdate }) } as any

    await updateContactInfo('profile-1', { phone: '555-1234' }, injectedClient)

    expect(mockUpdate).toHaveBeenCalledWith({ phone: '555-1234' })
    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })
})

describe('updateProfilePhotoPath', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_update_photo_path', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update }),
    } as any)

    await updateProfilePhotoPath('profile-1', 'barn-1/profile-photos/profile-1/123.jpg')
    expect(update).toHaveBeenCalledWith({ photo_path: 'barn-1/profile-photos/profile-1/123.jpg' })
  })

  it('should_clear_photo_path_when_null', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update }),
    } as any)

    await updateProfilePhotoPath('profile-1', null)
    expect(update).toHaveBeenCalledWith({ photo_path: null })
  })

  it('should_filter_by_profile_id', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: mockEq }),
      }),
    } as any)

    await updateProfilePhotoPath('profile-99', 'path.jpg')
    expect(mockEq).toHaveBeenCalledWith('id', 'profile-99')
  })

  it('should_throw_on_supabase_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: new Error('update error') }),
        }),
      }),
    } as any)

    await expect(updateProfilePhotoPath('profile-1', 'path.jpg')).rejects.toThrow('update error')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: mockEq })
    const injectedClient = { from: vi.fn().mockReturnValue({ update }) } as any

    await updateProfilePhotoPath('profile-1', 'path.jpg', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_db_operation', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: mockEq })
    const mockFrom = vi.fn().mockReturnValue({ update })
    const injectedClient = { from: mockFrom } as any

    await updateProfilePhotoPath('profile-1', 'path.jpg', injectedClient)

    expect(mockFrom).toHaveBeenCalledWith('profiles')
  })
})

function makeSelectChainForProfilePhotoPath(photoPath: string | null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: createMockProfile({ id: 'profile-1', photo_path: photoPath }), error: null }),
      }),
    }),
  }
}

function makeUpdateChainForProfilePhotoPath(error: Error | null = null) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error }),
    }),
  }
}

describe('replaceProfilePhoto', () => {
  const file = new File([new Uint8Array(10)], 'photo.jpg', { type: 'image/jpeg' })

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(uploadFile).mockReset()
    vi.mocked(removeFile).mockReset()
    vi.mocked(uploadFile).mockResolvedValue(undefined)
    vi.mocked(removeFile).mockResolvedValue(undefined)
  })

  it('should_upload_to_profile_photos_prefix', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForProfilePhotoPath(null)) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeUpdateChainForProfilePhotoPath()) } as any)

    await replaceProfilePhoto('profile-1', 'barn-1', file, 'jpg')

    expect(uploadFile).toHaveBeenCalledWith(expect.stringMatching(/^barn-1\/profile-photos\/profile-1\/\d+\.jpg$/), file, 'image/jpeg', undefined)
  })

  it('should_update_photo_path_after_successful_upload', async () => {
    const updateChain = makeUpdateChainForProfilePhotoPath()
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForProfilePhotoPath(null)) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(updateChain) } as any)

    await replaceProfilePhoto('profile-1', 'barn-1', file, 'jpg')

    expect(updateChain.update).toHaveBeenCalledWith({ photo_path: expect.stringMatching(/^barn-1\/profile-photos\/profile-1\/\d+\.jpg$/) })
  })

  it('should_remove_old_photo_after_replacing', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForProfilePhotoPath('barn-1/profile-photos/profile-1/old.jpg')) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeUpdateChainForProfilePhotoPath()) } as any)

    await replaceProfilePhoto('profile-1', 'barn-1', file, 'jpg')

    expect(removeFile).toHaveBeenCalledWith('barn-1/profile-photos/profile-1/old.jpg', undefined)
  })

  it('should_not_remove_anything_when_there_was_no_previous_photo', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForProfilePhotoPath(null)) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeUpdateChainForProfilePhotoPath()) } as any)

    await replaceProfilePhoto('profile-1', 'barn-1', file, 'jpg')

    expect(removeFile).not.toHaveBeenCalled()
  })

  it('should_roll_back_uploaded_file_when_db_update_fails', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForProfilePhotoPath(null)) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeUpdateChainForProfilePhotoPath(new Error('db error'))) } as any)

    await expect(replaceProfilePhoto('profile-1', 'barn-1', file, 'jpg')).rejects.toThrow('db error')
    expect(removeFile).toHaveBeenCalledWith(expect.stringMatching(/^barn-1\/profile-photos\/profile-1\/\d+\.jpg$/), undefined)
  })

  it('should_not_remove_old_photo_when_db_update_fails', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForProfilePhotoPath('barn-1/profile-photos/profile-1/old.jpg')) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeUpdateChainForProfilePhotoPath(new Error('db error'))) } as any)

    await expect(replaceProfilePhoto('profile-1', 'barn-1', file, 'jpg')).rejects.toThrow('db error')
    expect(removeFile).not.toHaveBeenCalledWith('barn-1/profile-photos/profile-1/old.jpg')
  })

  it('should_propagate_error_when_upload_fails', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForProfilePhotoPath(null)) } as any)
    vi.mocked(uploadFile).mockRejectedValue(new Error('upload error'))

    await expect(replaceProfilePhoto('profile-1', 'barn-1', file, 'jpg')).rejects.toThrow('upload error')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const injectedClient = {
      from: vi.fn()
        .mockReturnValueOnce(makeSelectChainForProfilePhotoPath(null))
        .mockReturnValueOnce(makeUpdateChainForProfilePhotoPath()),
    } as any

    await replaceProfilePhoto('profile-1', 'barn-1', file, 'jpg', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_forward_injected_client_to_upload_file', async () => {
    const injectedClient = {
      from: vi.fn()
        .mockReturnValueOnce(makeSelectChainForProfilePhotoPath(null))
        .mockReturnValueOnce(makeUpdateChainForProfilePhotoPath()),
    } as any

    await replaceProfilePhoto('profile-1', 'barn-1', file, 'jpg', injectedClient)

    expect(uploadFile).toHaveBeenCalledWith(expect.stringMatching(/^barn-1\/profile-photos\/profile-1\/\d+\.jpg$/), file, 'image/jpeg', injectedClient)
  })
})

describe('removeProfilePhoto', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(removeFile).mockReset()
    vi.mocked(removeFile).mockResolvedValue(undefined)
  })

  it('should_clear_photo_path_when_photo_present', async () => {
    const updateChain = makeUpdateChainForProfilePhotoPath()
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForProfilePhotoPath('barn-1/profile-photos/profile-1/photo.jpg')) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(updateChain) } as any)

    await removeProfilePhoto('profile-1')

    expect(updateChain.update).toHaveBeenCalledWith({ photo_path: null })
  })

  it('should_remove_storage_file_when_photo_present', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForProfilePhotoPath('barn-1/profile-photos/profile-1/photo.jpg')) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeUpdateChainForProfilePhotoPath()) } as any)

    await removeProfilePhoto('profile-1')

    expect(removeFile).toHaveBeenCalledWith('barn-1/profile-photos/profile-1/photo.jpg', undefined)
  })

  it('should_do_nothing_when_no_photo_is_present', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForProfilePhotoPath(null)) } as any)

    await removeProfilePhoto('profile-1')

    expect(removeFile).not.toHaveBeenCalled()
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const injectedClient = {
      from: vi.fn()
        .mockReturnValueOnce(makeSelectChainForProfilePhotoPath('barn-1/profile-photos/profile-1/photo.jpg'))
        .mockReturnValueOnce(makeUpdateChainForProfilePhotoPath()),
    } as any

    await removeProfilePhoto('profile-1', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_forward_injected_client_to_remove_file', async () => {
    const injectedClient = {
      from: vi.fn()
        .mockReturnValueOnce(makeSelectChainForProfilePhotoPath('barn-1/profile-photos/profile-1/photo.jpg'))
        .mockReturnValueOnce(makeUpdateChainForProfilePhotoPath()),
    } as any

    await removeProfilePhoto('profile-1', injectedClient)

    expect(removeFile).toHaveBeenCalledWith('barn-1/profile-photos/profile-1/photo.jpg', injectedClient)
  })
})

// #1641. Written only by service-role callers — `scripts/setup-demo-user.ts` at bootstrap and
// `createOrResumeDemoBarn` on the first `/demo` visit after deploy. RLS pins the column against
// a self-update, so a user-context client calling this would be refused by the policy.
describe('markProfileAsDemo', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_set_is_demo_true', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await markProfileAsDemo('profile-1')

    expect(update).toHaveBeenCalledWith({ is_demo: true })
  })

  it('should_filter_by_profile_id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: vi.fn().mockReturnValue({ eq }) }),
    } as any)

    await markProfileAsDemo('profile-1')

    expect(eq).toHaveBeenCalledWith('id', 'profile-1')
  })

  it('should_throw_when_update_fails', async () => {
    const eq = vi.fn().mockResolvedValue({ error: new Error('update failed') })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: vi.fn().mockReturnValue({ eq }) }),
    } as any)

    await expect(markProfileAsDemo('profile-1')).rejects.toThrow('update failed')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const injectedClient = { from: vi.fn().mockReturnValue({ update: vi.fn().mockReturnValue({ eq }) }) } as any

    await markProfileAsDemo('profile-1', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })
})
