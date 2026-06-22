import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createNotification, markNotificationRead, markAllNotificationsRead } from '../notifications'

describe('createNotification', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_from_notifications_table', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await createNotification({ userId: 'user-1', barnId: 'barn-1', type: 'outstanding_payment', title: 'You have an outstanding payment' })

    expect(mockFrom).toHaveBeenCalledWith('notifications')
  })

  it('should_upsert_with_correct_payload', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
    } as any)

    await createNotification({
      userId: 'user-1',
      barnId: 'barn-1',
      type: 'outstanding_payment',
      title: 'You have an outstanding payment',
      body: 'Check finances',
      link: '/barn/test/finances',
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: 'user-1',
        barn_id: 'barn-1',
        type: 'outstanding_payment',
        title: 'You have an outstanding payment',
        body: 'Check finances',
        link: '/barn/test/finances',
        read_at: null,
      },
      { onConflict: 'user_id,barn_id,type', ignoreDuplicates: false }
    )
  })

  it('should_upsert_with_null_optional_fields_when_omitted', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
    } as any)

    await createNotification({ userId: 'user-1', barnId: 'barn-1', type: 'pending_approval', title: 'Pending approval' })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ body: null, link: null, read_at: null }),
      expect.any(Object)
    )
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('insert failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: dbError }),
      }),
    } as any)

    await expect(
      createNotification({ userId: 'user-1', barnId: 'barn-1', type: 'outstanding_payment', title: 'Overdue' })
    ).rejects.toThrow('insert failed')
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
