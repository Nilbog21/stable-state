import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/db/notifications', () => ({
  createNotification: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

import { getAuthenticatedUser } from '@/lib/db/auth'
import { createNotification, markNotificationRead, markAllNotificationsRead } from '@/lib/db/notifications'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getBarnBySlug } from '@/lib/db/barns'
import {
  createNotificationAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from '../notifications'

function mockAuthUser(userId = 'user-1') {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: userId } as any)
}

function mockAuthNoUser() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
}

function mockActiveMembership() {
  vi.mocked(getUserMembership).mockResolvedValue({ status: 'active' } as any)
}

describe('createNotificationAction', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(createNotification).mockReset()
    vi.mocked(getUserMembership).mockReset()
  })

  it('should_return_error_when_not_authenticated', async () => {
    mockAuthNoUser()

    const result = await createNotificationAction({
      userId: 'user-1',
      barnId: 'barn-1',
      type: 'outstanding_payment',
      title: 'Overdue',
    })

    expect(result).toEqual({ error: 'not authenticated' })
  })

  it('should_return_error_when_caller_is_not_an_active_member', async () => {
    mockAuthUser()
    vi.mocked(getUserMembership).mockResolvedValue(null)

    const result = await createNotificationAction({
      userId: 'user-1',
      barnId: 'barn-1',
      type: 'outstanding_payment',
      title: 'Overdue',
    })

    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_not_call_createNotification_when_caller_is_not_an_active_member', async () => {
    mockAuthUser()
    vi.mocked(getUserMembership).mockResolvedValue(null)

    await createNotificationAction({
      userId: 'user-1',
      barnId: 'barn-1',
      type: 'outstanding_payment',
      title: 'Overdue',
    })

    expect(createNotification).not.toHaveBeenCalled()
  })

  it('should_return_error_when_caller_membership_is_pending', async () => {
    mockAuthUser()
    vi.mocked(getUserMembership).mockResolvedValue({ status: 'pending' } as any)

    const result = await createNotificationAction({
      userId: 'user-1',
      barnId: 'barn-1',
      type: 'outstanding_payment',
      title: 'Overdue',
    })

    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_not_call_createNotification_when_caller_membership_is_pending', async () => {
    mockAuthUser()
    vi.mocked(getUserMembership).mockResolvedValue({ status: 'pending' } as any)

    await createNotificationAction({
      userId: 'user-1',
      barnId: 'barn-1',
      type: 'outstanding_payment',
      title: 'Overdue',
    })

    expect(createNotification).not.toHaveBeenCalled()
  })

  it('should_call_createNotification_with_params', async () => {
    mockAuthUser()
    mockActiveMembership()
    vi.mocked(createNotification).mockResolvedValue(undefined)

    await createNotificationAction({
      userId: 'user-2',
      barnId: 'barn-1',
      type: 'pending_approval',
      title: 'New member pending',
    })

    expect(createNotification).toHaveBeenCalledWith({
      userId: 'user-2',
      barnId: 'barn-1',
      type: 'pending_approval',
      title: 'New member pending',
    })
  })

  it('should_return_null_error_on_success', async () => {
    mockAuthUser()
    mockActiveMembership()
    vi.mocked(createNotification).mockResolvedValue(undefined)

    const result = await createNotificationAction({
      userId: 'user-1',
      barnId: 'barn-1',
      type: 'incomplete_profile',
      title: 'Complete your profile',
    })

    expect(result).toEqual({ error: null })
  })

  it('should_return_error_on_db_failure', async () => {
    mockAuthUser()
    mockActiveMembership()
    vi.mocked(createNotification).mockRejectedValue(new Error('db error'))

    const result = await createNotificationAction({
      userId: 'user-1',
      barnId: 'barn-1',
      type: 'outstanding_payment',
      title: 'Overdue',
    })

    expect(result).toEqual({ error: 'Failed to create notification' })
  })
})

describe('markNotificationReadAction', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(markNotificationRead).mockReset()
  })

  it('should_return_error_when_not_authenticated', async () => {
    mockAuthNoUser()

    const result = await markNotificationReadAction('notif-1')

    expect(result).toEqual({ error: 'not authenticated' })
  })

  it('should_call_markNotificationRead_with_id', async () => {
    mockAuthUser()
    vi.mocked(markNotificationRead).mockResolvedValue(undefined)

    await markNotificationReadAction('notif-99')

    expect(markNotificationRead).toHaveBeenCalledWith('notif-99')
  })

  it('should_return_null_error_on_success', async () => {
    mockAuthUser()
    vi.mocked(markNotificationRead).mockResolvedValue(undefined)

    const result = await markNotificationReadAction('notif-1')

    expect(result).toEqual({ error: null })
  })

  it('should_return_error_on_db_failure', async () => {
    mockAuthUser()
    vi.mocked(markNotificationRead).mockRejectedValue(new Error('db error'))

    const result = await markNotificationReadAction('notif-1')

    expect(result).toEqual({ error: 'Failed to mark notification read' })
  })
})

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
