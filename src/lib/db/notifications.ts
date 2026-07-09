import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Notification, NotificationType } from './types'

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
// so one recipient's upsert failure doesn't block the rest of the batch.
export async function upsertNotificationsForRecipients<T>(
  client: SupabaseClient,
  recipients: Map<string, { userId: string; barnId: string; payload: T }>,
  formatter: (payload: T) => { title: string; body: string },
  type: NotificationType,
  linkForBarn: (barnId: string) => string
): Promise<number> {
  let errorCount = 0
  for (const recipient of recipients.values()) {
    try {
      const { title, body } = formatter(recipient.payload)
      await upsertNotification(client, {
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

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
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
