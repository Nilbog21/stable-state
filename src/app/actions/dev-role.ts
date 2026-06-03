'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/navigation'
import type { Role } from '@/lib/db/types'

const OVERRIDE_COOKIE = 'dev_role_override'
const ALLOWED_ROLES: Role[] = ['manager', 'trainer', 'rider']

export async function setDevRoleOverride(role: Role, barnPath: string): Promise<void> {
  if (!ALLOWED_ROLES.includes(role)) {
    throw new Error(`Invalid dev role override: ${role}`)
  }
  const cookieStore = await cookies()
  cookieStore.set(OVERRIDE_COOKIE, role, { path: '/' })
  revalidatePath(barnPath)
}

export async function clearDevRoleOverride(barnPath: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(OVERRIDE_COOKIE)
  revalidatePath(barnPath)
}
