import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createNotification, deleteNotificationByType, markAllNotificationsRead, getNotifications, upsertNotification, upsertNotificationsForRecipients, resolveCancellationRecipients, formatNearbyInstructorNotification, getUnreadNotificationCount } from '../notifications'

describe('formatNearbyInstructorNotification', () => {
  it('should_use_singular_phrasing_when_count_is_one', () => {
    const { title } = formatNearbyInstructorNotification(1)

    expect(title).toBe('1 new lesson scheduled nearby')
  })

  it('should_use_plural_phrasing_when_count_is_greater_than_one', () => {
    const { title } = formatNearbyInstructorNotification(3)

    expect(title).toBe('3 new lessons scheduled nearby')
  })

  it('should_use_singular_phrasing_in_body_when_count_is_one', () => {
    const { body } = formatNearbyInstructorNotification(1)

    expect(body).toContain('A lesson was')
  })

  it('should_use_plural_phrasing_in_body_when_count_is_greater_than_one', () => {
    const { body } = formatNearbyInstructorNotification(2)

    expect(body).toContain('Lessons were')
  })
})

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

    await createNotification({ userId: 'user-1', barnId: 'barn-1', type: 'lesson_cancelled', title: 'Lesson cancelled' })

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

    await createNotification({ userId: 'user-1', barnId: 'barn-1', type: 'lesson_cancelled', title: 'Lesson cancelled' }, injectedClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledWith('create_or_update_notification', expect.any(Object))
  })
})

describe('resolveCancellationRecipients', () => {
  describe('scope: lesson', () => {
    it('should_include_managers_and_riders_when_trainer_cancels', async () => {
      const getManagerUserIds = vi.fn().mockResolvedValue(['manager-1'])

      const result = await resolveCancellationRecipients({
        scope: 'lesson',
        actorRole: 'trainer',
        riderUserIds: ['rider-1', 'rider-2'],
        instructorUserId: 'instructor-1',
        getManagerUserIds,
      })

      expect(result).toEqual(['manager-1', 'rider-1', 'rider-2'])
    })

    it('should_call_getManagerUserIds_when_trainer_cancels', async () => {
      const getManagerUserIds = vi.fn().mockResolvedValue([])

      await resolveCancellationRecipients({
        scope: 'lesson',
        actorRole: 'trainer',
        riderUserIds: [],
        instructorUserId: null,
        getManagerUserIds,
      })

      expect(getManagerUserIds).toHaveBeenCalledTimes(1)
    })

    it('should_include_instructor_and_riders_when_manager_cancels', async () => {
      const getManagerUserIds = vi.fn().mockResolvedValue(['manager-1'])

      const result = await resolveCancellationRecipients({
        scope: 'lesson',
        actorRole: 'manager',
        riderUserIds: ['rider-1'],
        instructorUserId: 'instructor-1',
        getManagerUserIds,
      })

      expect(result).toEqual(['instructor-1', 'rider-1'])
    })

    it('should_not_call_getManagerUserIds_when_manager_cancels', async () => {
      const getManagerUserIds = vi.fn().mockResolvedValue(['manager-1'])

      await resolveCancellationRecipients({
        scope: 'lesson',
        actorRole: 'manager',
        riderUserIds: [],
        instructorUserId: 'instructor-1',
        getManagerUserIds,
      })

      expect(getManagerUserIds).not.toHaveBeenCalled()
    })

    it('should_omit_instructor_when_manager_cancels_and_instructor_is_null', async () => {
      const getManagerUserIds = vi.fn().mockResolvedValue([])

      const result = await resolveCancellationRecipients({
        scope: 'lesson',
        actorRole: 'manager',
        riderUserIds: ['rider-1'],
        instructorUserId: null,
        getManagerUserIds,
      })

      expect(result).toEqual(['rider-1'])
    })
  })

  describe('scope: rider_participation', () => {
    it('should_include_instructor_and_managers_when_rider_self_cancels', async () => {
      const getManagerUserIds = vi.fn().mockResolvedValue(['manager-1'])

      const result = await resolveCancellationRecipients({
        scope: 'rider_participation',
        actorRole: 'rider',
        affectedRiderUserId: 'rider-1',
        instructorUserId: 'instructor-1',
        getManagerUserIds,
      })

      expect(result).toEqual(['instructor-1', 'manager-1'])
    })

    it('should_omit_instructor_when_rider_self_cancels_and_instructor_is_null', async () => {
      const getManagerUserIds = vi.fn().mockResolvedValue(['manager-1'])

      const result = await resolveCancellationRecipients({
        scope: 'rider_participation',
        actorRole: 'rider',
        affectedRiderUserId: 'rider-1',
        instructorUserId: null,
        getManagerUserIds,
      })

      expect(result).toEqual(['manager-1'])
    })

    it('should_include_affected_rider_and_managers_when_trainer_cancels', async () => {
      const getManagerUserIds = vi.fn().mockResolvedValue(['manager-1'])

      const result = await resolveCancellationRecipients({
        scope: 'rider_participation',
        actorRole: 'trainer',
        affectedRiderUserId: 'rider-1',
        instructorUserId: 'instructor-1',
        getManagerUserIds,
      })

      expect(result).toEqual(['rider-1', 'manager-1'])
    })

    it('should_include_only_affected_rider_when_manager_cancels', async () => {
      const getManagerUserIds = vi.fn().mockResolvedValue(['manager-1'])

      const result = await resolveCancellationRecipients({
        scope: 'rider_participation',
        actorRole: 'manager',
        affectedRiderUserId: 'rider-1',
        instructorUserId: 'instructor-1',
        getManagerUserIds,
      })

      expect(result).toEqual(['rider-1'])
    })

    it('should_not_call_getManagerUserIds_when_manager_cancels', async () => {
      const getManagerUserIds = vi.fn().mockResolvedValue(['manager-1'])

      await resolveCancellationRecipients({
        scope: 'rider_participation',
        actorRole: 'manager',
        affectedRiderUserId: 'rider-1',
        instructorUserId: 'instructor-1',
        getManagerUserIds,
      })

      expect(getManagerUserIds).not.toHaveBeenCalled()
    })

    it('should_return_empty_array_when_manager_cancels_and_affected_rider_is_null', async () => {
      const getManagerUserIds = vi.fn().mockResolvedValue([])

      const result = await resolveCancellationRecipients({
        scope: 'rider_participation',
        actorRole: 'manager',
        affectedRiderUserId: null,
        instructorUserId: 'instructor-1',
        getManagerUserIds,
      })

      expect(result).toEqual([])
    })
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

  it('should_use_injected_client_when_provided', async () => {
    const { mockFrom } = makeChain({ error: null })
    const injectedClient = { from: mockFrom } as any

    await deleteNotificationByType('user-1', 'barn-1', 'incomplete_profile', injectedClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalledWith('notifications')
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

describe('upsertNotification', () => {
  it('should_upsert_with_correct_payload_and_conflict_target', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    const client = { from: vi.fn().mockReturnValue({ upsert: mockUpsert }) } as any

    await upsertNotification(client, {
      userId: 'user-1',
      barnId: 'barn-1',
      type: 'outstanding_payment',
      title: 'Overdue',
      body: 'You have an outstanding payment',
      link: '/barn/test/finances',
    })

    expect(client.from).toHaveBeenCalledWith('notifications')
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: 'user-1',
        barn_id: 'barn-1',
        type: 'outstanding_payment',
        title: 'Overdue',
        body: 'You have an outstanding payment',
        link: '/barn/test/finances',
        read_at: null,
      },
      { onConflict: 'user_id,barn_id,type' }
    )
  })

  it('should_throw_when_upsert_returns_error', async () => {
    const dbError = new Error('upsert failed')
    const client = { from: vi.fn().mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: dbError }) }) } as any

    await expect(
      upsertNotification(client, {
        userId: 'user-1',
        barnId: 'barn-1',
        type: 'outstanding_payment',
        title: 'Overdue',
        body: 'You have an outstanding payment',
        link: '/barn/test/finances',
      })
    ).rejects.toThrow('upsert failed')
  })
})

describe('upsertNotificationsForRecipients', () => {
  it('should_upsert_once_per_recipient_in_map', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    const client = { from: vi.fn().mockReturnValue({ upsert: mockUpsert }) } as any
    const recipients = new Map([
      ['user-1:barn-1', { userId: 'user-1', barnId: 'barn-1', payload: 2 }],
      ['user-2:barn-1', { userId: 'user-2', barnId: 'barn-1', payload: 1 }],
    ])

    await upsertNotificationsForRecipients(
      client,
      recipients,
      (count: number) => ({ title: `${count} stopped`, body: `${count} series stopped` }),
      'recurring_series_stopped',
      () => '/barn/test/lessons'
    )

    expect(mockUpsert).toHaveBeenCalledTimes(2)
  })

  it('should_pass_formatter_output_as_title_and_body', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    const client = { from: vi.fn().mockReturnValue({ upsert: mockUpsert }) } as any
    const recipients = new Map([
      ['user-1:barn-1', { userId: 'user-1', barnId: 'barn-1', payload: { count: 3, total: 450 } }],
    ])

    await upsertNotificationsForRecipients(
      client,
      recipients,
      ({ count, total }: { count: number; total: number }) => ({ title: `${count} outstanding`, body: `$${total} total` }),
      'outstanding_payment',
      () => '/barn/test/finances/outstanding'
    )

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ title: '3 outstanding', body: '$450 total' }),
      expect.any(Object)
    )
  })

  it('should_generate_link_via_linkForBarn_callback', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    const client = { from: vi.fn().mockReturnValue({ upsert: mockUpsert }) } as any
    const recipients = new Map([
      ['user-1:barn-42', { userId: 'user-1', barnId: 'barn-42', payload: 1 }],
    ])

    await upsertNotificationsForRecipients(
      client,
      recipients,
      () => ({ title: 't', body: 'b' }),
      'recurring_series_stopped',
      (barnId: string) => `/barn/${barnId}/lessons`
    )

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ link: '/barn/barn-42/lessons' }),
      expect.any(Object)
    )
  })

  it('should_continue_processing_remaining_recipients_when_one_fails', async () => {
    const mockUpsert = vi.fn()
      .mockResolvedValueOnce({ error: new Error('boom') })
      .mockResolvedValueOnce({ error: null })
    const client = { from: vi.fn().mockReturnValue({ upsert: mockUpsert }) } as any
    const recipients = new Map([
      ['user-1:barn-1', { userId: 'user-1', barnId: 'barn-1', payload: 1 }],
      ['user-2:barn-1', { userId: 'user-2', barnId: 'barn-1', payload: 1 }],
    ])

    await upsertNotificationsForRecipients(
      client, recipients, () => ({ title: 't', body: 'b' }), 'recurring_series_stopped', () => '/link'
    )

    expect(mockUpsert).toHaveBeenCalledTimes(2)
  })

  it('should_return_count_of_failed_upserts', async () => {
    const mockUpsert = vi.fn()
      .mockResolvedValueOnce({ error: new Error('boom') })
      .mockResolvedValueOnce({ error: null })
    const client = { from: vi.fn().mockReturnValue({ upsert: mockUpsert }) } as any
    const recipients = new Map([
      ['user-1:barn-1', { userId: 'user-1', barnId: 'barn-1', payload: 1 }],
      ['user-2:barn-1', { userId: 'user-2', barnId: 'barn-1', payload: 1 }],
    ])

    const errorCount = await upsertNotificationsForRecipients(
      client, recipients, () => ({ title: 't', body: 'b' }), 'recurring_series_stopped', () => '/link'
    )

    expect(errorCount).toBe(1)
  })

  it('should_return_zero_when_map_is_empty', async () => {
    const client = { from: vi.fn() } as any

    const errorCount = await upsertNotificationsForRecipients(
      client, new Map(), () => ({ title: 't', body: 'b' }), 'recurring_series_stopped', () => '/link'
    )

    expect(errorCount).toBe(0)
  })

  it('should_call_custom_send_function_with_recipient_params_when_provided', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    const client = { from: vi.fn().mockReturnValue({ upsert: mockUpsert }) } as any
    const customSend = vi.fn().mockResolvedValue(undefined)
    const recipients = new Map([
      ['user-1:barn-1', { userId: 'user-1', barnId: 'barn-1', payload: undefined }],
    ])

    await upsertNotificationsForRecipients(
      client, recipients, () => ({ title: 't', body: 'b' }), 'lesson_cancelled', () => '/link', customSend
    )

    expect(customSend).toHaveBeenCalledWith(client, {
      userId: 'user-1',
      barnId: 'barn-1',
      type: 'lesson_cancelled',
      title: 't',
      body: 'b',
      link: '/link',
    })
  })

  it('should_not_call_default_upsert_when_custom_send_function_is_provided', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    const client = { from: vi.fn().mockReturnValue({ upsert: mockUpsert }) } as any
    const customSend = vi.fn().mockResolvedValue(undefined)
    const recipients = new Map([
      ['user-1:barn-1', { userId: 'user-1', barnId: 'barn-1', payload: undefined }],
    ])

    await upsertNotificationsForRecipients(
      client, recipients, () => ({ title: 't', body: 'b' }), 'lesson_cancelled', () => '/link', customSend
    )

    expect(mockUpsert).not.toHaveBeenCalled()
  })
})

describe('getUnreadNotificationCount', () => {
  it('should_call_the_get_unread_notification_title_rpc_with_user_barn_and_type', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null })
    const client = { rpc: mockRpc } as any

    await getUnreadNotificationCount(client, 'user-1', 'barn-1', 'instructor_lesson_nearby')

    expect(mockRpc).toHaveBeenCalledWith('get_unread_notification_title', {
      p_user_id: 'user-1',
      p_barn_id: 'barn-1',
      p_type: 'instructor_lesson_nearby',
    })
  })

  it('should_parse_the_leading_count_from_the_returned_title', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: '3 new lessons scheduled nearby' })
    const client = { rpc: mockRpc } as any

    const count = await getUnreadNotificationCount(client, 'user-1', 'barn-1', 'instructor_lesson_nearby')

    expect(count).toBe(3)
  })

  it('should_return_zero_when_no_unread_row_exists', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null })
    const client = { rpc: mockRpc } as any

    const count = await getUnreadNotificationCount(client, 'user-1', 'barn-1', 'instructor_lesson_nearby')

    expect(count).toBe(0)
  })

  it('should_throw_when_the_rpc_returns_an_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: new Error('not_authorized') })
    const client = { rpc: mockRpc } as any

    await expect(
      getUnreadNotificationCount(client, 'user-1', 'barn-1', 'instructor_lesson_nearby')
    ).rejects.toThrow('not_authorized')
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

describe('getNotifications instant branding', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_brand_created_at_with_the_barns_timezone', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [{ id: 'n-1', created_at: '2026-07-15T20:00:00Z' }], error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any)

    const [row] = await getNotifications('user-1', 'barn-1', 'America/New_York')

    expect(row.created_at).toEqual({ at: '2026-07-15T20:00:00Z', tz: 'America/New_York' })
  })
})
