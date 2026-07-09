import type { PaymentType } from '@/lib/db/types'
import { getInstructorsByBarn, getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getHorsesByBarn } from '@/lib/db/horses'

function parseExertionLevel(raw: FormDataEntryValue | null): number {
  const n = parseInt(raw as string ?? '', 10)
  return Number.isNaN(n) ? 3 : Math.max(1, Math.min(5, n))
}

function parseFee(raw: string | null): number | null {
  if (!raw || raw.trim() === '') return null
  const n = parseFloat(raw)
  return isNaN(n) ? null : n
}

export type ParsedLessonFormData = {
  horseIds: string[]
  newHorseName: string | null
  newHorseExertionLevel: number
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
  membership: { id: string; role: string }
): Promise<{ error: string } | { data: ParsedLessonFormData }> {
  const horseIds = formData.getAll('horse_id') as string[]
  const newHorseName = (formData.get('new_horse_name') as string | null)?.trim() || null
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
  if (!newHorseName && horseIds.length === 0) return { error: 'horse required' }
  if (newHorseName && horseIds.length > 0) return { error: 'select a horse or add a new one, not both' }

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
  const newHorseExertionLevel = parseExertionLevel(formData.get('new_horse_exertion_level'))

  const [barnHorses, barnRiders] = await Promise.all([
    getHorsesByBarn(barnId),
    getActiveMembersWithProfiles(barnId, 'rider'),
  ])

  if (horseIds.length > 0) {
    const validHorseIds = new Set(barnHorses.map((h) => h.id))
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

  const fee = parseFee(feeRaw)
  if (fee == null) return { error: 'fee is required' }

  return {
    data: {
      horseIds,
      newHorseName,
      newHorseExertionLevel,
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
