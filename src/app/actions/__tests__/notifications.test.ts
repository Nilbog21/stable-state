import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/db/notifications', () => ({
  markAllNotificationsRead: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

import { getAuthenticatedUser } from '@/lib/db/auth'
import { markAllNotificationsRead } from '@/lib/db/notifications'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getBarnBySlug } from '@/lib/db/barns'
import { markAllNotificationsReadAction } from '../notifications'

function mockAuthUser(userId = 'user-1') {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: userId } as any)
}

function mockAuthNoUser() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
}

describe('markAllNotificationsReadAction', () => {
  function mockMembership(userId = 'user-42', barnId = 'barn-1') {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: userId } as any)
    vi.mocked(getBarnBySlug).mockResolvedValue({ id: barnId } as any)
    vi.mocked(getUserMembership).mockResolvedValue({ status: 'active' } as any)
  }

  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(markAllNotificationsRead).mockReset()
  })

  it('should_return_error_when_not_authenticated', async () => {
    mockAuthNoUser()

    const result = await markAllNotificationsReadAction('barn-slug')

    expect(result).toEqual({ error: 'not authenticated' })
  })

  it('should_return_error_when_barn_not_found', async () => {
    mockAuthUser('user-42')
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    const result = await markAllNotificationsReadAction('barn-slug')

    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_return_error_when_caller_is_not_an_active_member', async () => {
    mockAuthUser('user-42')
    vi.mocked(getBarnBySlug).mockResolvedValue({ id: 'barn-1' } as any)
    vi.mocked(getUserMembership).mockResolvedValue(null)

    const result = await markAllNotificationsReadAction('barn-slug')

    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_call_markAllNotificationsRead_with_user_and_barn_id', async () => {
    mockMembership('user-42', 'barn-1')
    vi.mocked(markAllNotificationsRead).mockResolvedValue(undefined)

    await markAllNotificationsReadAction('barn-slug')

    expect(markAllNotificationsRead).toHaveBeenCalledWith('user-42', 'barn-1')
  })

  it('should_return_null_error_on_success', async () => {
    mockMembership()
    vi.mocked(markAllNotificationsRead).mockResolvedValue(undefined)

    const result = await markAllNotificationsReadAction('barn-slug')

    expect(result).toEqual({ error: null })
  })

  it('should_return_error_on_db_failure', async () => {
    mockMembership()
    vi.mocked(markAllNotificationsRead).mockRejectedValue(new Error('db error'))

    const result = await markAllNotificationsReadAction('barn-slug')

    expect(result).toEqual({ error: 'Failed to mark all notifications read' })
  })
})
