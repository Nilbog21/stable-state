'use server'

import { getAuthenticatedUser } from '@/lib/db/auth'
import {
  createNotification as dbCreateNotification,
  markNotificationRead as dbMarkNotificationRead,
  markAllNotificationsRead as dbMarkAllNotificationsRead,
} from '@/lib/db/notifications'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { requireMembership } from '@/lib/auth/guard'
import type { NotificationType } from '@/lib/db/types'

// requireMembership takes a barnSlug and redirects a page's caller on auth
// failure. This action authorizes against an arbitrary target barnId (not
// the caller's current page) and isn't wired to any UI page today — it's a
// general-purpose primitive that must return { error } rather than
// redirect, so the manual check stays.
export async function createNotificationAction(params: {
  userId: string
  barnId: string
  type: NotificationType
  title: string
  body?: string | null
  link?: string | null
}): Promise<{ error: string | null }> {
  const user = await getAuthenticatedUser()

  if (!user) return { error: 'not authenticated' }

  const membership = await getUserMembership(user.id, params.barnId)
  if (membership?.status !== 'active') return { error: 'not authorized' }

  try {
    await dbCreateNotification(params)
  } catch {
    return { error: 'Failed to create notification' }
  }

  return { error: null }
}

// No barn/role dimension here — scoped purely to the caller's own
// notification row via RLS, same shape as profile/actions.ts's
// updateProfileAction, so requireMembership doesn't apply.
export async function markNotificationReadAction(
  id: string
): Promise<{ error: string | null }> {
  const user = await getAuthenticatedUser()

  if (!user) return { error: 'not authenticated' }

  try {
    await dbMarkNotificationRead(id)
  } catch {
    return { error: 'Failed to mark notification read' }
  }

  return { error: null }
}

export async function markAllNotificationsReadAction(
  barnSlug: string
): Promise<{ error: string | null }> {
  const { user, barn } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])

  try {
    await dbMarkAllNotificationsRead(user.id, barn.id)
  } catch {
    return { error: 'Failed to mark all notifications read' }
  }

  return { error: null }
}
