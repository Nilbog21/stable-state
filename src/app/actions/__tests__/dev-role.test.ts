import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { setDevRoleOverride, clearDevRoleOverride } from '../dev-role'

function mockCookieStore() {
  const store = { set: vi.fn(), delete: vi.fn() }
  vi.mocked(cookies).mockResolvedValue(store as any)
  return store
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('setDevRoleOverride', () => {
  it('should_set_dev_role_override_cookie_for_valid_role', async () => {
    const store = mockCookieStore()

    await setDevRoleOverride('manager', '/barn/green-acres')

    expect(store.set).toHaveBeenCalledWith(
      'dev_role_override',
      'manager',
      expect.objectContaining({ path: '/' })
    )
  })

  it('should_revalidate_the_barn_path_after_setting_cookie', async () => {
    mockCookieStore()

    await setDevRoleOverride('trainer', '/barn/green-acres')

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres')
  })

  it('should_throw_when_role_is_invalid', async () => {
    mockCookieStore()

    await expect(setDevRoleOverride('admin' as any, '/barn/green-acres')).rejects.toThrow()
  })

  it('should_throw_when_role_is_unknown', async () => {
    mockCookieStore()

    await expect(setDevRoleOverride('superuser' as any, '/barn/green-acres')).rejects.toThrow()
  })
})

describe('clearDevRoleOverride', () => {
  it('should_delete_dev_role_override_cookie', async () => {
    const store = mockCookieStore()

    await clearDevRoleOverride('/barn/green-acres')

    expect(store.delete).toHaveBeenCalledWith('dev_role_override')
  })

  it('should_revalidate_the_barn_path_after_clearing_cookie', async () => {
    mockCookieStore()

    await clearDevRoleOverride('/barn/green-acres')

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres')
  })
})
