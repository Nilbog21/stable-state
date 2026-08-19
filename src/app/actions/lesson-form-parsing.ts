/**
 * Shared parse/validate step for `submitLesson` and `updateLessonAction` (mirroring
 * `expenses.ts`'s `parseExpenseFormData`): field extraction, participant-count and
 * cross-field rules, instructor resolution (a non-manager caller is pinned to their own
 * membership; a manager-supplied instructor id is validated against
 * `getInstructorsByBarn`), and DB-backed existence checks that every submitted
 * horse/rider id belongs to the barn. The horse check accepts the barn's *active* horses plus
 * whatever `attachedHorseIds` the caller supplies — the edit page re-offers a lesson's
 * deactivated horses as checked, enabled options (so that editing an unrelated field can't
 * silently detach one), and the parser has to accept back what that form handed out (#1276).
 * `submitLesson` passes none, which is what keeps a *new* lesson to active horses only.
 * Deliberately has no `'use server'` directive —
 * `parseLessonFormData` must never be independently reachable as a Server Action, or it
 * would skip the `requireMembership` check its callers perform.
 */
import type { PaymentType } from '@/lib/db/types'
import { getInstructorsByBarn, getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getHorsesByBarn } from '@/lib/db/horses'
import { parseNonNegativeAmount } from '@/lib/parse-amount'

function parseExertionLevel(raw: FormDataEntryValue | null): number {
  const n = parseInt(raw as string ?? '', 10)
  return Number.isNaN(n) ? 3 : Math.max(1, Math.min(5, n))
}

export type ParsedLessonFormData = {
  horseIds: string[]
  exertionLevels: Map<string, number>
  riderIds: string[]
  lessonAt: string
  fee: number
  lessonType: 'normal' | 'group'
  jumping: boolean
  paymentType: PaymentType | null
  tierName: string
  instructorId: string
}

export async function parseLessonFormData(
  formData: FormData,
  barnId: string,
  membership: { id: string; role: string },
  attachedHorseIds: string[] = []
): Promise<{ error: string } | { data: ParsedLessonFormData }> {
  const horseIds = formData.getAll('horse_id') as string[]
  const riderIds = (formData.getAll('rider_id') as string[]).filter(id => id !== '')
  const lessonAt = formData.get('lesson_at') as string | null
  const feeRaw = formData.get('fee') as string | null
  const tierName = (formData.get('tier_name') as string | null) ?? 'Custom'
  const lessonTypeRaw = (formData.get('lesson_type') as string | null) ?? 'normal'
  const jumping = formData.get('jumping') === 'true'
  const paymentTypeRaw = (formData.get('payment_type') as string | null) || null
  const paymentType = paymentTypeRaw as PaymentType | null

  if (lessonTypeRaw !== 'normal' && lessonTypeRaw !== 'group') return { error: 'invalid lesson type' }
  const lessonType = lessonTypeRaw as 'normal' | 'group'

  if (riderIds.length === 0) return { error: 'rider required' }
  if (lessonType === 'normal' && riderIds.length > 1) return { error: 'normal lesson requires exactly 1 rider' }
  if (lessonType === 'group' && riderIds.length < 2) return { error: 'group lesson requires at least 2 riders' }
  if (!lessonAt) return { error: 'date and time required' }
  if (horseIds.length === 0) return { error: 'horse required' }

  const isManager = membership.role === 'manager'
  const instructorIdFromForm = isManager ? (formData.get('instructor_id') as string | null) : null
  const instructorId = instructorIdFromForm || membership.id

  if (isManager && instructorIdFromForm && instructorIdFromForm !== membership.id) {
    const instructors = await getInstructorsByBarn(barnId)
    if (!instructors.some((i) => i.membershipId === instructorIdFromForm)) return { error: 'Invalid instructor' }
  }

  const exertionLevels = new Map<string, number>(
    horseIds.map(id => [id, parseExertionLevel(formData.get(`exertion_${id}`))])
  )

  const [barnHorses, barnRiders] = await Promise.all([
    getHorsesByBarn(barnId),
    getActiveMembersWithProfiles(barnId, 'rider'),
  ])

  if (horseIds.length > 0) {
    const validHorseIds = new Set([...barnHorses.map((h) => h.id), ...attachedHorseIds])
    if (horseIds.some((id) => !validHorseIds.has(id))) {
      return { error: 'horse not found in this barn' }
    }
  }

  if (riderIds.length > 0) {
    const validRiderIds = new Set(barnRiders.map((m) => m.membershipId))
    if (riderIds.some((id) => !validRiderIds.has(id))) {
      return { error: 'rider not found in this barn' }
    }
  }

  const fee = parseNonNegativeAmount(feeRaw)
  if (fee == null) return { error: 'fee is required' }

  return {
    data: {
      horseIds,
      exertionLevels,
      riderIds,
      lessonAt,
      fee,
      lessonType,
      jumping,
      paymentType,
      tierName,
      instructorId,
    },
  }
}
