import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  createPendingMembership: vi.fn(),
}))

vi.mock('@/lib/db/profiles', () => ({
  upsertProfile: vi.fn(),
}))

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` }) }))
vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, createPendingMembership } from '@/lib/db/barn-memberships'
import { upsertProfile } from '@/lib/db/profiles'
import { registerForBarn } from '../actions'

const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '' }
const mockUser = { id: 'user-1', email: 'trainer@example.com', user_metadata: {} }

function makeFormData(fields: Record<string, string>) {
  const fd = new FormData()
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v))
  return fd
}

describe('registerForBarn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      },
    } as any)
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(createPendingMembership).mockResolvedValue({
      id: 'm1', user_id: 'user-1', barn_id: 'barn-1', role: 'trainer', status: 'pending', created_at: '',
    } as any)
    vi.mocked(upsertProfile).mockResolvedValue({
      user_id: 'user-1', first_name: 'Jane', last_name: 'Doe', created_at: '',
    } as any)
  })

  it('should_create_profile_and_pending_membership_for_new_user', async () => {
    const fd = makeFormData({ firstName: 'Jane', lastName: 'Doe', role: 'trainer' })

    await registerForBarn('green-acres', null, fd).catch(() => {})

    expect(upsertProfile).toHaveBeenCalledWith('user-1', 'Jane', 'Doe')
    expect(createPendingMembership).toHaveBeenCalledWith('user-1', 'barn-1', 'trainer')
  })

  it('should_redirect_to_pending_page_after_successful_registration', async () => {
    const fd = makeFormData({ firstName: 'Jane', lastName: 'Doe', role: 'trainer' })

    await expect(registerForBarn('green-acres', null, fd)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/pending')
  })

  it('should_redirect_to_pending_page_if_user_already_has_pending_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({
      id: 'm1', user_id: 'user-1', barn_id: 'barn-1', role: 'trainer', status: 'pending', created_at: '',
    } as any)

    const fd = makeFormData({ firstName: 'Jane', lastName: 'Doe', role: 'trainer' })

    await expect(registerForBarn('green-acres', null, fd)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/pending')
    expect(createPendingMembership).not.toHaveBeenCalled()
  })

  it('should_redirect_to_barn_home_if_user_already_has_active_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({
      id: 'm1', user_id: 'user-1', barn_id: 'barn-1', role: 'trainer', status: 'active', created_at: '',
    } as any)

    const fd = makeFormData({ firstName: 'Jane', lastName: 'Doe', role: 'trainer' })

    await expect(registerForBarn('green-acres', null, fd)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/')
    expect(createPendingMembership).not.toHaveBeenCalled()
  })

  it('should_return_error_for_invalid_role', async () => {
    const fd = makeFormData({ firstName: 'Jane', lastName: 'Doe', role: 'admin' })
    const result = await registerForBarn('green-acres', null, fd)
    expect(result).toEqual({ error: 'Please select a valid role.' })
  })

  it('should_return_error_for_blank_first_name', async () => {
    const fd = makeFormData({ firstName: '   ', lastName: 'Doe', role: 'trainer' })
    const result = await registerForBarn('green-acres', null, fd)
    expect(result).toEqual({ error: 'First name is required.' })
  })

  it('should_return_error_for_blank_last_name', async () => {
    const fd = makeFormData({ firstName: 'Jane', lastName: '', role: 'trainer' })
    const result = await registerForBarn('green-acres', null, fd)
    expect(result).toEqual({ error: 'Last name is required.' })
  })

  it('should_redirect_to_login_error_when_barn_is_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    const fd = makeFormData({ firstName: 'Jane', lastName: 'Doe', role: 'trainer' })
    await expect(registerForBarn('unknown-barn', null, fd)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login?error=auth_callback_failed')
  })

  it('should_redirect_to_barn_login_when_user_is_not_authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const fd = makeFormData({ firstName: 'Jane', lastName: 'Doe', role: 'trainer' })
    await expect(registerForBarn('green-acres', null, fd)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_return_error_when_db_write_fails', async () => {
    vi.mocked(upsertProfile).mockRejectedValue(new Error('DB error'))
    const fd = makeFormData({ firstName: 'Jane', lastName: 'Doe', role: 'trainer' })
    const result = await registerForBarn('green-acres', null, fd)
    expect(result).toEqual({ error: 'Something went wrong. Please try again.' })
  })
})
