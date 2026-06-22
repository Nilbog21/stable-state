'use server'

import { createClient } from '@/lib/supabase/server'
import {
  createNotification as dbCreateNotification,
  markNotificationRead as dbMarkNotificationRead,
  markAllNotificationsRead as dbMarkAllNotificationsRead,
} from '@/lib/db/notifications'
import type { NotificationType } from '@/lib/db/types'

export async function createNotificationAction(params: {
  userId: string
  barnId: string
  type: NotificationType
  title: string
  body?: string | null
  link?: string | null
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'not authenticated' }

  try {
    await dbCreateNotification(params)
  } catch {
    return { error: 'Failed to create notification' }
  }

  return { error: null }
}

export async function markNotificationReadAction(
  id: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'not authenticated' }

  try {
    await dbMarkNotificationRead(id)
  } catch {
    return { error: 'Failed to mark notification read' }
  }

  return { error: null }
}

export async function markAllNotificationsReadAction(
  barnId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'not authenticated' }

  try {
    await dbMarkAllNotificationsRead(user.id, barnId)
  } catch {
    return { error: 'Failed to mark all notifications read' }
  }

  return { error: null }
}
