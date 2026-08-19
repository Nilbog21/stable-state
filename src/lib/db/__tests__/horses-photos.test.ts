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
import { uploadFile, removeFile } from '../document-storage'
import { updateHorsePhotoPath, replaceHorsePhoto, removeHorsePhoto } from '../horses'

describe('updateHorsePhotoPath', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_update_photo_path', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc } as any)

    await updateHorsePhotoPath('horse-1', 'barn-1', 'barn-1/horse-photos/horse-1/123.jpg')
    expect(rpc).toHaveBeenCalledWith('update_horse_photo', {
      p_horse_id: 'horse-1',
      p_barn_id: 'barn-1',
      p_photo_path: 'barn-1/horse-photos/horse-1/123.jpg',
    })
  })

  it('should_clear_photo_path_when_null', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc } as any)

    await updateHorsePhotoPath('horse-1', 'barn-1', null)
    expect(rpc).toHaveBeenCalledWith('update_horse_photo', {
      p_horse_id: 'horse-1',
      p_barn_id: 'barn-1',
      p_photo_path: null,
    })
  })

  it('should_throw_on_supabase_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: new Error('update error') }),
    } as any)

    await expect(updateHorsePhotoPath('horse-1', 'barn-1', 'path.jpg')).rejects.toThrow('update error')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq2 }) })
    const injectedClient = { from: vi.fn().mockReturnValue({ update }) } as any

    await updateHorsePhotoPath('horse-1', 'barn-1', 'path.jpg', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_db_operation', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq2 }) })
    const mockFrom = vi.fn().mockReturnValue({ update })
    const injectedClient = { from: mockFrom } as any

    await updateHorsePhotoPath('horse-1', 'barn-1', 'path.jpg', injectedClient)

    expect(mockFrom).toHaveBeenCalledWith('horses')
  })

  it('should_throw_on_injected_client_error', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: new Error('update error') })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq2 }) })
    const injectedClient = { from: vi.fn().mockReturnValue({ update }) } as any

    await expect(updateHorsePhotoPath('horse-1', 'barn-1', 'path.jpg', injectedClient)).rejects.toThrow('update error')
  })

  it('should_not_touch_photo_uploaded_by_on_injected_client_set', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq2 }) })
    const injectedClient = { from: vi.fn().mockReturnValue({ update }) } as any

    await updateHorsePhotoPath('horse-1', 'barn-1', 'path.jpg', injectedClient)

    expect(update).toHaveBeenCalledWith({ photo_path: 'path.jpg' })
  })

  it('should_clear_photo_uploaded_by_on_injected_client_delete', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq2 }) })
    const injectedClient = { from: vi.fn().mockReturnValue({ update }) } as any

    await updateHorsePhotoPath('horse-1', 'barn-1', null, injectedClient)

    expect(update).toHaveBeenCalledWith({ photo_path: null, photo_uploaded_by: null })
  })
})

function makeSelectChainForPhotoPath(photoPath: string | null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: createMockHorse({ id: 'horse-1', photo_path: photoPath }), error: null }),
        }),
      }),
    }),
  }
}

function makeUpdateChainForPhotoPath(error: Error | null = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ error }),
  }
}

function makeInjectedUpdateChainForPhotoPath(error: Error | null = null) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error }),
      }),
    }),
  }
}

describe('replaceHorsePhoto', () => {
  const file = new File([new Uint8Array(10)], 'photo.jpg', { type: 'image/jpeg' })

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(uploadFile).mockReset()
    vi.mocked(removeFile).mockReset()
    vi.mocked(uploadFile).mockResolvedValue(undefined)
    vi.mocked(removeFile).mockResolvedValue(undefined)
  })

  it('should_upload_to_horse_photos_prefix', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath(null)) } as any)
      .mockResolvedValueOnce(makeUpdateChainForPhotoPath() as any)

    await replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg')

    expect(uploadFile).toHaveBeenCalledWith(expect.stringMatching(/^barn-1\/horse-photos\/horse-1\/\d+\.jpg$/), file, 'image/jpeg', undefined)
  })

  it('should_update_photo_path_after_successful_upload', async () => {
    const updateChain = makeUpdateChainForPhotoPath()
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath(null)) } as any)
      .mockResolvedValueOnce(updateChain as any)

    await replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg')

    expect(updateChain.rpc).toHaveBeenCalledWith('update_horse_photo', {
      p_horse_id: 'horse-1',
      p_barn_id: 'barn-1',
      p_photo_path: expect.stringMatching(/^barn-1\/horse-photos\/horse-1\/\d+\.jpg$/),
    })
  })

  it('should_remove_old_photo_after_replacing', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath('barn-1/horse-photos/horse-1/old.jpg')) } as any)
      .mockResolvedValueOnce(makeUpdateChainForPhotoPath() as any)

    await replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg')

    expect(removeFile).toHaveBeenCalledWith('barn-1/horse-photos/horse-1/old.jpg', undefined)
  })

  it('should_not_remove_anything_when_there_was_no_previous_photo', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath(null)) } as any)
      .mockResolvedValueOnce(makeUpdateChainForPhotoPath() as any)

    await replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg')

    expect(removeFile).not.toHaveBeenCalled()
  })

  it('should_roll_back_uploaded_file_when_db_update_fails', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath(null)) } as any)
      .mockResolvedValueOnce(makeUpdateChainForPhotoPath(new Error('db error')) as any)

    await expect(replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg')).rejects.toThrow('db error')
    expect(removeFile).toHaveBeenCalledWith(expect.stringMatching(/^barn-1\/horse-photos\/horse-1\/\d+\.jpg$/), undefined)
  })

  it('should_not_remove_old_photo_when_db_update_fails', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath('barn-1/horse-photos/horse-1/old.jpg')) } as any)
      .mockResolvedValueOnce(makeUpdateChainForPhotoPath(new Error('db error')) as any)

    await expect(replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg')).rejects.toThrow('db error')
    expect(removeFile).not.toHaveBeenCalledWith('barn-1/horse-photos/horse-1/old.jpg')
  })

  it('should_propagate_error_when_upload_fails', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath(null)) } as any)
    vi.mocked(uploadFile).mockRejectedValue(new Error('upload error'))

    await expect(replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg')).rejects.toThrow('upload error')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const injectedClient = {
      from: vi.fn()
        .mockReturnValueOnce(makeSelectChainForPhotoPath(null))
        .mockReturnValueOnce(makeInjectedUpdateChainForPhotoPath()),
    } as any

    await replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_forward_injected_client_to_upload_file', async () => {
    const injectedClient = {
      from: vi.fn()
        .mockReturnValueOnce(makeSelectChainForPhotoPath(null))
        .mockReturnValueOnce(makeInjectedUpdateChainForPhotoPath()),
    } as any

    await replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg', injectedClient)

    expect(uploadFile).toHaveBeenCalledWith(expect.stringMatching(/^barn-1\/horse-photos\/horse-1\/\d+\.jpg$/), file, 'image/jpeg', injectedClient)
  })
})

describe('removeHorsePhoto', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(removeFile).mockReset()
    vi.mocked(removeFile).mockResolvedValue(undefined)
  })

  it('should_clear_photo_path_when_photo_present', async () => {
    const updateChain = makeUpdateChainForPhotoPath()
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath('barn-1/horse-photos/horse-1/photo.jpg')) } as any)
      .mockResolvedValueOnce(updateChain as any)

    await removeHorsePhoto('horse-1', 'barn-1')

    expect(updateChain.rpc).toHaveBeenCalledWith('update_horse_photo', {
      p_horse_id: 'horse-1',
      p_barn_id: 'barn-1',
      p_photo_path: null,
    })
  })

  it('should_remove_storage_file_when_photo_present', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath('barn-1/horse-photos/horse-1/photo.jpg')) } as any)
      .mockResolvedValueOnce(makeUpdateChainForPhotoPath() as any)

    await removeHorsePhoto('horse-1', 'barn-1')

    expect(removeFile).toHaveBeenCalledWith('barn-1/horse-photos/horse-1/photo.jpg', undefined)
  })

  it('should_do_nothing_when_no_photo_is_present', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath(null)) } as any)

    await removeHorsePhoto('horse-1', 'barn-1')

    expect(removeFile).not.toHaveBeenCalled()
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const injectedClient = {
      from: vi.fn()
        .mockReturnValueOnce(makeSelectChainForPhotoPath('barn-1/horse-photos/horse-1/photo.jpg'))
        .mockReturnValueOnce(makeInjectedUpdateChainForPhotoPath()),
    } as any

    await removeHorsePhoto('horse-1', 'barn-1', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_forward_injected_client_to_remove_file', async () => {
    const injectedClient = {
      from: vi.fn()
        .mockReturnValueOnce(makeSelectChainForPhotoPath('barn-1/horse-photos/horse-1/photo.jpg'))
        .mockReturnValueOnce(makeInjectedUpdateChainForPhotoPath()),
    } as any

    await removeHorsePhoto('horse-1', 'barn-1', injectedClient)

    expect(removeFile).toHaveBeenCalledWith('barn-1/horse-photos/horse-1/photo.jpg', injectedClient)
  })
})

