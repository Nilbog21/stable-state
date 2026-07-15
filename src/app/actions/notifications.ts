'use server'

import { getAuthenticatedUser } from '@/lib/db/auth'
import { markAllNotificationsRead as dbMarkAllNotificationsRead } from '@/lib/db/notifications'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'

// Invoked from NotificationBell's dropdown while the user stays on the
// current page — requireMembership would redirect or 404 on failure,
// yanking them away mid-interaction, so this keeps the manual check +
// graceful { error } return.
export async function markAllNotificationsReadAction(
  barnSlug: string
): Promise<{ error: string | null }> {
  const user = await getAuthenticatedUser()
  if (!user) return { error: 'not authenticated' }

  const barn = await getBarnBySlug(barnSlug)
  if (!barn) return { error: 'not authorized' }

  const membership = await getUserMembership(user.id, barn.id)
  if (membership?.status !== 'active') return { error: 'not authorized' }

  try {
    await dbMarkAllNotificationsRead(user.id, barn.id)
  } catch {
    return { error: 'Failed to mark all notifications read' }
  }

  return { error: null }
}
