import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createNotification, deleteNotificationByType, markNotificationRead, markAllNotificationsRead, getNotifications } from '../notifications'

describe('createNotification', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_create_or_update_notification', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createNotification({ userId: 'user-1', barnId: 'barn-1', type: 'outstanding_payment', title: 'You have an outstanding payment' })

    expect(mockRpc).toHaveBeenCalledWith('create_or_update_notification', expect.any(Object))
  })

  it('should_call_rpc_with_correct_payload', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createNotification({
      userId: 'user-1',
      barnId: 'barn-1',
      type: 'outstanding_payment',
      title: 'You have an outstanding payment',
      body: 'Check finances',
      link: '/barn/test/finances',
    })

    expect(mockRpc).toHaveBeenCalledWith('create_or_update_notification', {
      p_user_id: 'user-1',
      p_barn_id: 'barn-1',
      p_type: 'outstanding_payment',
      p_title: 'You have an outstanding payment',
      p_body: 'Check finances',
      p_link: '/barn/test/finances',
    })
  })

  it('should_call_rpc_with_null_optional_fields_when_omitted', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createNotification({ userId: 'user-1', barnId: 'barn-1', type: 'pending_approval', title: 'Pending approval' })

    expect(mockRpc).toHaveBeenCalledWith(
      'create_or_update_notification',
      expect.objectContaining({ p_body: null, p_link: null })
    )
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('insert failed')
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: dbError }),
    } as any)

    await expect(
      createNotification({ userId: 'user-1', barnId: 'barn-1', type: 'outstanding_payment', title: 'Overdue' })
    ).rejects.toThrow('insert failed')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    const injectedClient = { rpc: mockRpc } as any

    await createNotification({ userId: 'user-1', barnId: 'barn-1', type: 'pending_approval', title: 'New request' }, injectedClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledWith('create_or_update_notification', expect.any(Object))
  })
})

describe('deleteNotificationByType', () => {
  function makeChain(result: { error: unknown }) {
    const mockEq3 = vi.fn().mockResolvedValue(result)
    const mockEq2 = vi.fn().mockReturnValue({ eq: mockEq3 })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq1 })
    const mockFrom = vi.fn().mockReturnValue({ delete: mockDelete })
    return { mockFrom, mockDelete, mockEq1, mockEq2, mockEq3 }
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_from_notifications_table', async () => {
    const { mockFrom } = makeChain({ error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await deleteNotificationByType('user-1', 'barn-1', 'incomplete_profile')

    expect(mockFrom).toHaveBeenCalledWith('notifications')
  })

  it('should_filter_by_user_id', async () => {
    const { mockFrom, mockEq1 } = makeChain({ error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await deleteNotificationByType('user-99', 'barn-1', 'incomplete_profile')

    expect(mockEq1).toHaveBeenCalledWith('user_id', 'user-99')
  })

  it('should_filter_by_barn_id', async () => {
    const { mockFrom, mockEq2 } = makeChain({ error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await deleteNotificationByType('user-1', 'barn-42', 'incomplete_profile')

    expect(mockEq2).toHaveBeenCalledWith('barn_id', 'barn-42')
  })

  it('should_filter_by_type', async () => {
    const { mockFrom, mockEq3 } = makeChain({ error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await deleteNotificationByType('user-1', 'barn-1', 'member_incomplete_profile')

    expect(mockEq3).toHaveBeenCalledWith('type', 'member_incomplete_profile')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('delete failed')
    const { mockFrom } = makeChain({ error: dbError })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await expect(deleteNotificationByType('user-1', 'barn-1', 'incomplete_profile')).rejects.toThrow('delete failed')
  })
})

describe('markNotificationRead', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_update_read_at_for_notification', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await markNotificationRead('notif-1')

    expect(mockUpdate).toHaveBeenCalledWith({ read_at: expect.any(String) })
  })

  it('should_filter_by_notification_id', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await markNotificationRead('notif-99')

    expect(mockEq).toHaveBeenCalledWith('id', 'notif-99')
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

    await expect(markNotificationRead('notif-1')).rejects.toThrow('update failed')
  })
})

describe('markAllNotificationsRead', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_pass_read_at_timestamp_to_update', async () => {
    const mockIsNull = vi.fn().mockResolvedValue({ error: null })
    const mockEq2 = vi.fn().mockReturnValue({ is: mockIsNull })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await markAllNotificationsRead('user-1', 'barn-1')

    expect(mockUpdate).toHaveBeenCalledWith({ read_at: expect.any(String) })
  })

  it('should_filter_by_user_id', async () => {
    const mockIsNull = vi.fn().mockResolvedValue({ error: null })
    const mockEq2 = vi.fn().mockReturnValue({ is: mockIsNull })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await markAllNotificationsRead('user-1', 'barn-1')

    expect(mockEq1).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('should_filter_by_barn_id', async () => {
    const mockIsNull = vi.fn().mockResolvedValue({ error: null })
    const mockEq2 = vi.fn().mockReturnValue({ is: mockIsNull })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await markAllNotificationsRead('user-1', 'barn-1')

    expect(mockEq2).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_unread_only', async () => {
    const mockIsNull = vi.fn().mockResolvedValue({ error: null })
    const mockEq2 = vi.fn().mockReturnValue({ is: mockIsNull })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await markAllNotificationsRead('user-1', 'barn-1')

    expect(mockIsNull).toHaveBeenCalledWith('read_at', null)
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('bulk update failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ error: dbError }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(markAllNotificationsRead('user-1', 'barn-1')).rejects.toThrow('bulk update failed')
  })
})

describe('getNotifications', () => {
  function makeChain(result: { data: unknown; error: unknown }) {
    const mockLimit = vi.fn().mockResolvedValue(result)
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })
    return { mockFrom, mockSelect, mockEq1, mockEq2, mockOrder, mockLimit }
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_from_notifications_table', async () => {
    const { mockFrom } = makeChain({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await getNotifications('user-1', 'barn-1')

    expect(mockFrom).toHaveBeenCalledWith('notifications')
  })

  it('should_select_all_columns', async () => {
    const { mockFrom, mockSelect } = makeChain({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await getNotifications('user-1', 'barn-1')

    expect(mockSelect).toHaveBeenCalledWith('*')
  })

  it('should_filter_by_user_id', async () => {
    const { mockFrom, mockEq1 } = makeChain({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await getNotifications('user-99', 'barn-1')

    expect(mockEq1).toHaveBeenCalledWith('user_id', 'user-99')
  })

  it('should_filter_by_barn_id', async () => {
    const { mockFrom, mockEq2 } = makeChain({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await getNotifications('user-1', 'barn-42')

    expect(mockEq2).toHaveBeenCalledWith('barn_id', 'barn-42')
  })

  it('should_order_by_created_at_desc', async () => {
    const { mockFrom, mockOrder } = makeChain({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await getNotifications('user-1', 'barn-1')

    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('should_limit_to_20_by_default', async () => {
    const { mockFrom, mockLimit } = makeChain({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await getNotifications('user-1', 'barn-1')

    expect(mockLimit).toHaveBeenCalledWith(20)
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { mockFrom } = makeChain({ data: null, error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    const result = await getNotifications('user-1', 'barn-1')

    expect(result).toEqual([])
  })

  it('should_return_notifications_array', async () => {
    const notif = { id: 'n-1', user_id: 'user-1', barn_id: 'barn-1', type: 'outstanding_payment', title: 'Pay up', body: null, link: null, read_at: null, created_at: '2026-01-01T00:00:00Z' }
    const { mockFrom } = makeChain({ data: [notif], error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    const result = await getNotifications('user-1', 'barn-1')

    expect(result).toEqual([notif])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('select failed')
    const { mockFrom } = makeChain({ data: null, error: dbError })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await expect(getNotifications('user-1', 'barn-1')).rejects.toThrow('select failed')
  })
})
