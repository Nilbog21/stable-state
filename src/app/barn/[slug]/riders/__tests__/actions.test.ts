import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockRider } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getAdminMembership: vi.fn(),
}))

vi.mock('@/lib/db/riders', () => ({
  updateRider: vi.fn(),
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

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getAdminMembership } from '@/lib/db/barn-memberships'
import { updateRider } from '@/lib/db/riders'
import { revalidatePath } from 'next/cache'
import { updateRiderAction } from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })
const mockAdminMembership = createMockMembership({ id: 'mem-adm', barn_id: null, role: 'admin' })
const mockRider = createMockRider({ id: 'rider-1', name: 'Jane Doe' })

describe('updateRiderAction', () => {
  let formData: FormData

  beforeEach(() => {
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getAdminMembership).mockResolvedValue(null)
    vi.mocked(updateRider).mockResolvedValue(mockRider)
    formData = new FormData()
    formData.set('name', 'Jane Doe Updated')
  })

  it('should_redirect_to_login_when_unauthenticated', async () => {
    setupAuth(null)

    await expect(updateRiderAction('green-acres', 'rider-1', formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(updateRider).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_barn_is_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(updateRiderAction('green-acres', 'rider-1', formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(updateRider).not.toHaveBeenCalled()
  })

  it('should_redirect_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(null)

    await expect(updateRiderAction('green-acres', 'rider-1', formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(updateRider).not.toHaveBeenCalled()
  })

  it('should_redirect_when_user_is_trainer_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ id: 'mem-tr', role: 'trainer' }))

    await expect(updateRiderAction('green-acres', 'rider-1', formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(updateRider).not.toHaveBeenCalled()
  })

  it('should_call_updateRider_and_revalidate_when_manager', async () => {
    await updateRiderAction('green-acres', 'rider-1', formData)

    expect(updateRider).toHaveBeenCalledWith('rider-1', 'Jane Doe Updated')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/riders')
  })

  it('should_call_updateRider_and_revalidate_when_admin', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(mockAdminMembership)

    await updateRiderAction('green-acres', 'rider-1', formData)

    expect(updateRider).toHaveBeenCalledWith('rider-1', 'Jane Doe Updated')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/riders')
  })

  it('should_not_call_updateRider_when_name_is_empty', async () => {
    formData.set('name', '   ')

    await updateRiderAction('green-acres', 'rider-1', formData)

    expect(updateRider).not.toHaveBeenCalled()
  })
})
