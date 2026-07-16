/**
 * Outstanding collections read layer — past unpaid lessons, uncollected rider
 * late-cancellation fees, and the pure merge that assembles them (plus
 * `agreement-finances.ts:getOutstandingCharges`) into the `OutstandingItem` list; split
 * out of `lesson-finances.ts`, whose income functions apply the instructor cut
 * while Outstanding never does.
 */
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveMemberNames } from './member-names'
import { getOutstandingLessonRows, getOutstandingCancellationFeeRows, getLessonJunctionRows } from './lesson-finance-queries'
import type { OutstandingCancellationFee, OutstandingCharge, OutstandingItem, OutstandingLesson, Role } from './types'

export function mergeOutstandingItems(
  lessons: OutstandingLesson[],
  charges: OutstandingCharge[],
  cancellationFees: OutstandingCancellationFee[] = []
): OutstandingItem[] {
  const lessonItems: OutstandingItem[] = lessons.map((l) => ({
    id: l.id,
    itemType: 'lesson',
    date: l.lesson_at,
    instructorName: l.instructor_name,
    riderNames: l.rider_names,
    fee: l.fee,
  }))
  const chargeItems: OutstandingItem[] = charges.map((c) => ({
    id: c.id,
    itemType: c.kind,
    date: c.period,
    instructorName: null,
    riderNames: [c.riderName],
    fee: c.fee,
    linkId: c.agreementId,
  }))
  const cancellationFeeItems: OutstandingItem[] = cancellationFees.map((c) => ({
    id: c.id,
    itemType: 'cancellation_fee',
    date: c.lessonAt,
    instructorName: c.instructorName,
    riderNames: [c.riderName],
    fee: c.fee,
    linkId: c.lessonId,
  }))
  return [...lessonItems, ...chargeItems, ...cancellationFeeItems].sort((a, b) => a.date.localeCompare(b.date))
}

export async function getOutstandingLessons(
  barnId: string,
  userId?: string,
  role?: Role,
  client?: SupabaseClient
): Promise<OutstandingLesson[]> {
  const supabase = client ?? await createClient()

  const outstandingRaw = await getOutstandingLessonRows(barnId, userId, role, supabase)

  if (outstandingRaw.length === 0) return []

  const outstandingIds = outstandingRaw.map((l) => l.id)
  const instructorIds = [...new Set(outstandingRaw.map((l) => l.instructor_id).filter((id): id is string => id !== null))]

  const lessonRiders = await getLessonJunctionRows('lesson_riders', 'rider_id', barnId, outstandingIds, supabase)

  const riderIds = [...new Set(lessonRiders.map((lr) => lr.rider_id))]

  const membershipNameMap = await resolveMemberNames([...riderIds, ...instructorIds], barnId, supabase)

  return outstandingRaw.map((lesson) => {
    const riderJunctionRows = lessonRiders.filter((lr) => lr.lesson_id === lesson.id)
    const rider_names = riderJunctionRows
      .map((lr) => membershipNameMap.get(lr.rider_id))
      .filter((name): name is string => Boolean(name))
    return {
      id: lesson.id,
      barn_id: lesson.barn_id,
      lesson_at: lesson.lesson_at,
      instructor_name: lesson.instructor_id ? membershipNameMap.get(lesson.instructor_id) ?? null : null,
      rider_names,
      fee: lesson.fee,
    }
  })
}

export async function getOutstandingCancellationFees(
  barnId: string,
  userId?: string,
  role?: Role,
  client?: SupabaseClient
): Promise<OutstandingCancellationFee[]> {
  const supabase = client ?? await createClient()

  const rows = await getOutstandingCancellationFeeRows(barnId, userId, role, supabase)
  if (!rows.length) return []

  const instructorIds = [...new Set(rows.map((r) => r.instructorId).filter((id): id is string => id !== null))]
  const riderIds = [...new Set(rows.map((r) => r.riderId))]
  const nameMap = await resolveMemberNames([...riderIds, ...instructorIds], barnId, supabase)

  return rows.map((row) => ({
    id: row.id,
    lessonId: row.lessonId,
    lessonAt: row.lessonAt,
    instructorName: row.instructorId ? nameMap.get(row.instructorId) ?? null : null,
    riderName: nameMap.get(row.riderId) ?? row.riderId,
    fee: row.fee,
  }))
}
