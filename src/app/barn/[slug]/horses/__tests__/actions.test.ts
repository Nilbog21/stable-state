import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockHorse } from '@/test/fixtures'
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

vi.mock('@/lib/db/horses', () => ({
  createHorse: vi.fn(),
  updateHorse: vi.fn(),
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
import { createHorse, updateHorse } from '@/lib/db/horses'
import { revalidatePath } from 'next/cache'
import { addHorseAction, updateHorseAction } from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })
const mockAdminMembership = createMockMembership({ id: 'mem-adm', barn_id: null, role: 'admin' })
const mockHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt' })

describe('addHorseAction', () => {
  let formData: FormData

  beforeEach(() => {
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getAdminMembership).mockResolvedValue(null)
    vi.mocked(createHorse).mockResolvedValue(mockHorse)
    formData = new FormData()
    formData.set('name', 'Thunderbolt')
  })

  it('should_redirect_to_login_when_unauthenticated', async () => {
    setupAuth(null)

    await expect(addHorseAction('green-acres', formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(createHorse).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_barn_is_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(addHorseAction('green-acres', formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(createHorse).not.toHaveBeenCalled()
  })

  it('should_redirect_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(null)

    await expect(addHorseAction('green-acres', formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(createHorse).not.toHaveBeenCalled()
  })

  it('should_redirect_when_user_is_trainer_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ id: 'mem-tr', role: 'trainer' }))

    await expect(addHorseAction('green-acres', formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(createHorse).not.toHaveBeenCalled()
  })

  it('should_call_createHorse_and_revalidate_when_manager', async () => {
    await addHorseAction('green-acres', formData)

    expect(createHorse).toHaveBeenCalledWith(mockBarn.id, 'Thunderbolt')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })

  it('should_call_createHorse_and_revalidate_when_admin', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(mockAdminMembership)

    await addHorseAction('green-acres', formData)

    expect(createHorse).toHaveBeenCalledWith(mockBarn.id, 'Thunderbolt')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })
})

describe('updateHorseAction', () => {
  let formData: FormData

  beforeEach(() => {
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getAdminMembership).mockResolvedValue(null)
    vi.mocked(updateHorse).mockResolvedValue(mockHorse)
    formData = new FormData()
    formData.set('name', 'Thunderbolt Updated')
  })

  it('should_redirect_to_login_when_unauthenticated', async () => {
    setupAuth(null)

    await expect(updateHorseAction('green-acres', 'horse-1', formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(updateHorse).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_barn_is_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(updateHorseAction('green-acres', 'horse-1', formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(updateHorse).not.toHaveBeenCalled()
  })

  it('should_redirect_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(null)

    await expect(updateHorseAction('green-acres', 'horse-1', formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(updateHorse).not.toHaveBeenCalled()
  })

  it('should_redirect_when_user_is_trainer_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ id: 'mem-tr', role: 'trainer' }))

    await expect(updateHorseAction('green-acres', 'horse-1', formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(updateHorse).not.toHaveBeenCalled()
  })

  it('should_call_updateHorse_and_revalidate_when_manager', async () => {
    await updateHorseAction('green-acres', 'horse-1', formData)

    expect(updateHorse).toHaveBeenCalledWith('horse-1', 'Thunderbolt Updated')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })

  it('should_call_updateHorse_and_revalidate_when_admin', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(mockAdminMembership)

    await updateHorseAction('green-acres', 'horse-1', formData)

    expect(updateHorse).toHaveBeenCalledWith('horse-1', 'Thunderbolt Updated')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })
})
