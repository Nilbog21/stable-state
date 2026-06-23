import { createClient } from '@/lib/supabase/server'
import type { Notification, NotificationType } from './types'

export async function createNotification(params: {
  userId: string
  barnId: string
  type: NotificationType
  title: string
  body?: string | null
  link?: string | null
}): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('notifications').upsert(
    {
      user_id: params.userId,
      barn_id: params.barnId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      link: params.link ?? null,
      read_at: null,
    },
    { onConflict: 'user_id,barn_id,type', ignoreDuplicates: false }
  )

  if (error) throw error
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
