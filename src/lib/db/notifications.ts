/**
 * Notification CRUD and fan-out: `createNotification` (the
 * `create_or_update_notification` RPC, upserting on `user_id,barn_id,type`), the
 * required-client `upsertNotification` variant for service-role callers with no
 * `auth.uid()`, batch `upsertNotificationsForRecipients`, cancellation-recipient
 * resolution and nearby-instructor formatting, unread count, list, delete-by-type, and
 * mark-all-read.
 */
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Notification, NotificationType, Role } from './types'

export async function createNotification(params: {
  userId: string
  barnId: string
  type: NotificationType
  title: string
  body?: string | null
  link?: string | null
}, client?: SupabaseClient): Promise<void> {
  const supabase = client ?? await createClient()
  const { error } = await supabase.rpc('create_or_update_notification', {
    p_user_id: params.userId,
    p_barn_id: params.barnId,
    p_type: params.type,
    p_title: params.title,
    p_body: params.body ?? null,
    p_link: params.link ?? null,
  })

  if (error) throw error
}

// createNotification goes through the create_or_update_notification RPC, which requires
// auth.uid() to match an active barn member -- a service-role client has no auth.uid()
// and would always get rejected. Upsert directly against the table instead, matching
// scripts/CLAUDE.md's guidance for RPCs with auth checks that block service-role callers.
export async function upsertNotification(
  client: SupabaseClient,
  params: {
    userId: string
    barnId: string
    type: NotificationType
    title: string
    body: string
    link: string
  }
): Promise<void> {
  const { error } = await client.from('notifications').upsert(
    {
      user_id: params.userId,
      barn_id: params.barnId,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link,
      read_at: null,
    },
    { onConflict: 'user_id,barn_id,type' }
  )

  if (error) throw error
}

// Consolidates the "aggregate recipients into a Map, then upsert each with an
// isolated try/catch" pattern shared by the nightly notification-generating scripts,
// so one recipient's upsert failure doesn't block the rest of the batch. `send`
// defaults to the raw-table `upsertNotification`, which requires a service-role
// client (see its own comment) -- callers with a session-authenticated client (e.g.
// Server Actions notifying a user other than the caller) must pass a `send` backed by
// the `create_or_update_notification` RPC (`createNotification`) instead, since the
// raw upsert's ON CONFLICT DO UPDATE branch is rejected by RLS for another user's row.
// Sends happen sequentially, not concurrently -- fine for the cron scripts' batch
// runs, and for the cancellation actions' typically single-digit recipient counts,
// but it does add per-recipient latency before those actions' redirect() fires.
export async function upsertNotificationsForRecipients<T>(
  client: SupabaseClient,
  recipients: Map<string, { userId: string; barnId: string; payload: T }>,
  formatter: (payload: T) => { title: string; body: string },
  type: NotificationType,
  linkForBarn: (barnId: string) => string,
  send: (
    client: SupabaseClient,
    params: { userId: string; barnId: string; type: NotificationType; title: string; body: string; link: string }
  ) => Promise<void> = upsertNotification
): Promise<number> {
  let errorCount = 0
  for (const recipient of recipients.values()) {
    try {
      const { title, body } = formatter(recipient.payload)
      await send(client, {
        userId: recipient.userId,
        barnId: recipient.barnId,
        type,
        title,
        body,
        link: linkForBarn(recipient.barnId),
      })
    } catch (err) {
      errorCount++
      console.error(`Failed to notify ${recipient.userId} (type=${type}):`, (err as Error).message)
    }
  }
  return errorCount
}

export type CancellationRecipientsParams =
  | {
      scope: 'lesson'
      actorRole: Role
      riderUserIds: string[]
      instructorUserId: string | null
      getManagerUserIds: () => Promise<string[]>
    }
  | {
      scope: 'rider_participation'
      actorRole: Role
      affectedRiderUserId: string | null
      instructorUserId: string | null
      getManagerUserIds: () => Promise<string[]>
    }

// Encodes "who gets notified for a cancellation," shared by cancelLessonAction and
// cancelRiderParticipationAction:
// - whole-lesson cancel: trainer cancels -> managers + riders; manager cancels -> instructor + riders
// - single-rider cancel: rider self-cancels -> instructor + managers; trainer cancels on the
//   rider's behalf -> affected rider + managers; manager cancels on the rider's behalf ->
//   affected rider only (the instructor is intentionally not notified in that branch)
export async function resolveCancellationRecipients(params: CancellationRecipientsParams): Promise<string[]> {
  if (params.scope === 'lesson') {
    if (params.actorRole === 'trainer') {
      return [...(await params.getManagerUserIds()), ...params.riderUserIds]
    }
    return params.instructorUserId ? [params.instructorUserId, ...params.riderUserIds] : params.riderUserIds
  }

  if (params.actorRole === 'rider') {
    const managerUserIds = await params.getManagerUserIds()
    return params.instructorUserId ? [params.instructorUserId, ...managerUserIds] : managerUserIds
  }
  const riderRecipients = params.affectedRiderUserId ? [params.affectedRiderUserId] : []
  if (params.actorRole === 'trainer') {
    return [...riderRecipients, ...(await params.getManagerUserIds())]
  }
  return riderRecipients
}

// Shared by submitLesson (immediate, single lesson) and generate-recurring-lessons.ts
// (batched across a cron run) so both produce identical notification copy.
export function formatNearbyInstructorNotification(count: number): { title: string; body: string } {
  return {
    title: `${count} new lesson${count === 1 ? '' : 's'} scheduled nearby`,
    body: `${count === 1 ? 'A lesson was' : 'Lessons were'} added within your barn's schedule buffer of one of your lessons.`,
  }
}

// instructor_lesson_nearby is written by two independent producers (submitLesson's
// notifyNearbyInstructors, generate-recurring-lessons.ts) that would otherwise blindly
// overwrite each other's count on upsert -- the same "two events sharing one
// (user_id, barn_id, type) upsert key" collision class #535 fixed for lesson_cancelled.
// Reading the existing unread row's count back out lets each producer add to it instead.
// ponytail: parses the count from the title text rather than a dedicated column; a
// read-then-write race between two near-simultaneous callers can still lose an
// increment -- acceptable given how rarely two nearby-lesson events land in the same window.
export async function getUnreadNotificationCount(
  client: SupabaseClient, userId: string, barnId: string, type: NotificationType
): Promise<number> {
  const { data, error } = await client.rpc('get_unread_notification_title', {
    p_user_id: userId,
    p_barn_id: barnId,
    p_type: type,
  })
  if (error) throw error

  const match = /^\d+/.exec(data ?? '')
  return match ? Number(match[0]) : 0
}

export async function getNotifications(
  userId: string,
  barnId: string,
  limit = 20
): Promise<Notification[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('barn_id', barnId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function deleteNotificationByType(
  userId: string,
  barnId: string,
  type: NotificationType,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client ?? await createClient()
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .eq('barn_id', barnId)
    .eq('type', type)

  if (error) throw error
}

export async function markAllNotificationsRead(userId: string, barnId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('barn_id', barnId)
    .is('read_at', null)

  if (error) throw error
}
