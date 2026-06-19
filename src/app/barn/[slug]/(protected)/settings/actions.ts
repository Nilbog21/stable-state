'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import {
  getUserMembership,
  approveMembership,
  deleteMembership,
  getMembershipById,
} from '@/lib/db/barn-memberships'
import { createRider } from '@/lib/db/riders'
import { getProfilesByUserIds } from '@/lib/db/profiles'
import {
  createTier,
  updateTier,
  setDefaultTier,
  getTierById,
  deactivateTier,
} from '@/lib/db/lesson-tiers'

async function requireManager(barnSlug: string) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect(`/barn/${barnSlug}/login`)

  const barn = await getBarnBySlug(barnSlug)
  if (!barn) redirect(`/barn/${barnSlug}/login`)

  const membership = await getUserMembership(data.user.id, barn.id)
  if (!membership || membership.status !== 'active' || membership.role !== 'manager') {
    redirect(`/barn/${barnSlug}/login`)
  }

  return barn
}

function parsePrice(raw: string | null): number | null {
  if (!raw || raw.trim() === '') return null
  const n = parseFloat(raw)
  return isNaN(n) ? null : n
}

export async function createTierAction(barnSlug: string, formData: FormData): Promise<void> {
  const barn = await requireManager(barnSlug)

  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return

  const price = parsePrice(formData.get('price') as string | null)

  await createTier(barn.id, name, price)
  revalidatePath(`/barn/${barnSlug}/settings`)
}

export async function updateTierAction(
  barnSlug: string,
  tierId: string,
  formData: FormData
): Promise<void> {
  const barn = await requireManager(barnSlug)

  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return

  const price = parsePrice(formData.get('price') as string | null)

  await updateTier(tierId, barn.id, { name, price })
  revalidatePath(`/barn/${barnSlug}/settings`)
}

export async function setDefaultTierAction(barnSlug: string, tierId: string): Promise<void> {
  const barn = await requireManager(barnSlug)
  await setDefaultTier(tierId, barn.id)
  revalidatePath(`/barn/${barnSlug}/settings`)
}

export async function deactivateTierAction(barnSlug: string, tierId: string): Promise<void> {
  const barn = await requireManager(barnSlug)

  const tier = await getTierById(tierId, barn.id)
  if (!tier) redirect(`/barn/${barnSlug}/login`)

  if (tier.is_default) {
    redirect(
      `/barn/${barnSlug}/settings?error=cannot_deactivate_default&errorTierId=${tierId}`
    )
  }

  await deactivateTier(tierId, barn.id)
  revalidatePath(`/barn/${barnSlug}/settings`)
}

export async function approveMembershipAction(
  barnSlug: string,
  membershipId: string
): Promise<void> {
  await requireManager(barnSlug)

  const toApprove = await getMembershipById(membershipId)
  await approveMembership(membershipId)

  if (toApprove?.role === 'rider' && toApprove.barn_id && toApprove.user_id) {
    const profiles = await getProfilesByUserIds([toApprove.user_id])
    const profile = profiles[0]
    if (profile) {
      const name = `${profile.first_name} ${profile.last_name}`.trim()
      try {
        await createRider(toApprove.barn_id, name, toApprove.user_id)
      } catch (err) {
        if ((err as { code?: string }).code !== '23505') throw err
      }
    }
  }

  revalidatePath(`/barn/${barnSlug}/settings`)
}

export async function rejectMembershipAction(
  barnSlug: string,
  membershipId: string
): Promise<void> {
  await requireManager(barnSlug)
  await deleteMembership(membershipId)
  revalidatePath(`/barn/${barnSlug}/settings`)
}

export async function removeMembershipAction(
  barnSlug: string,
  membershipId: string
): Promise<void> {
  await requireManager(barnSlug)
  await deleteMembership(membershipId)
  revalidatePath(`/barn/${barnSlug}/settings`)
}
