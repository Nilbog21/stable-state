import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/notifications', () => ({
  createNotification: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createNotification, markNotificationRead, markAllNotificationsRead } from '@/lib/db/notifications'
import {
  createNotificationAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from '../notifications'

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

describe('createNotificationAction', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(createNotification).mockReset()
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

  it('should_call_createNotification_with_params', async () => {
    mockAuthUser()
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
    vi.mocked(createClient).mockReset()
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
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(markAllNotificationsRead).mockReset()
  })

  it('should_return_error_when_not_authenticated', async () => {
    mockAuthNoUser()

    const result = await markAllNotificationsReadAction('barn-1')

    expect(result).toEqual({ error: 'not authenticated' })
  })

  it('should_call_markAllNotificationsRead_with_user_and_barn', async () => {
    mockAuthUser('user-42')
    vi.mocked(markAllNotificationsRead).mockResolvedValue(undefined)

    await markAllNotificationsReadAction('barn-1')

    expect(markAllNotificationsRead).toHaveBeenCalledWith('user-42', 'barn-1')
  })

  it('should_return_null_error_on_success', async () => {
    mockAuthUser()
    vi.mocked(markAllNotificationsRead).mockResolvedValue(undefined)

    const result = await markAllNotificationsReadAction('barn-1')

    expect(result).toEqual({ error: null })
  })

  it('should_return_error_on_db_failure', async () => {
    mockAuthUser()
    vi.mocked(markAllNotificationsRead).mockRejectedValue(new Error('db error'))

    const result = await markAllNotificationsReadAction('barn-1')

    expect(result).toEqual({ error: 'Failed to mark all notifications read' })
  })
})
