import { cookies } from 'next/headers'
import { getUserMembership, getAdminMembership } from './barn-memberships'
import type { BarnMembership, Role } from './types'

const OVERRIDE_COOKIE = 'dev_role_override'
const OVERRIDABLE_ROLES: Role[] = ['manager', 'trainer', 'rider']

export async function getEffectiveMembership(
  userId: string,
  barnId: string
): Promise<BarnMembership | null> {
  const membership =
    (await getUserMembership(userId, barnId)) ??
    (await getAdminMembership(userId))

  if (
    process.env.NODE_ENV === 'development' &&
    membership?.role === 'admin'
  ) {
    const cookieStore = await cookies()
    const override = cookieStore.get(OVERRIDE_COOKIE)?.value as Role | undefined

    if (override && OVERRIDABLE_ROLES.includes(override)) {
      return {
        id: 'dev-override',
        user_id: userId,
        barn_id: barnId,
        role: override,
        status: 'active',
        created_at: '',
        default_fee: null,
      }
    }
  }

  return membership
}
