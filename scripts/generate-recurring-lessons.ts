import { fileURLToPath } from 'url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateNextLessonForSeries, stopLessonSeries } from '@/lib/db/lesson-series'
import { upsertNotificationsForRecipients, formatNearbyInstructorNotification } from '@/lib/db/notifications'
import { getActiveManagerUserIds } from '@/lib/db/barn-memberships'
import { getNearbyInstructorMembershipIds } from '@/lib/db/schedule'
import { mustSucceed, runCronJob } from './script-utils'
import type { LessonSeries } from '@/lib/db/types'

const HORIZON_DAYS = 28
const CADENCE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export function isDueForGeneration(latestLessonAt: string, now: Date): boolean {
  return new Date(latestLessonAt).getTime() <= now.getTime() + HORIZON_DAYS * DAY_MS
}

export function computeNextLessonAt(latestLessonAt: string): string {
  return new Date(new Date(latestLessonAt).getTime() + CADENCE_DAYS * DAY_MS).toISOString()
}

export function hasMissingRider(riderIds: string[], memberships: { id: string; status: string }[]): boolean {
  return riderIds.some((riderId) => {
    const membership = memberships.find((m) => m.id === riderId)
    return !membership || membership.status !== 'active'
  })
}

export function hasUnavailableHorse(horseIds: string[], horses: { id: string; is_active: boolean; is_available: boolean }[]): boolean {
  return horseIds.some((horseId) => {
    const horse = horses.find((h) => h.id === horseId)
    return !horse || !horse.is_active || !horse.is_available
  })
}

export function formatSeriesStoppedNotification(count: number): { title: string; body: string } {
  return {
    title: `${count} recurring series stopped`,
    body: `${count} recurring lesson series ${count === 1 ? 'was' : 'were'} stopped — a rider is no longer active, or the series has no lessons left to continue from.`,
  }
}

export function formatHorseUnavailableNotification(count: number): { title: string; body: string } {
  return {
    title: `${count} recurring lesson${count === 1 ? '' : 's'} generated with an unavailable horse`,
    body: `Check ${count === 1 ? 'this lesson' : 'these lessons'} — the assigned horse is marked unavailable or inactive.`,
  }
}

export function formatGenerationSummary(generated: number, stopped: number, warned: number, errors: number): string {
  const base = `Generated ${generated} lesson(s), stopped ${stopped} series, warned on ${warned} lesson(s).`
  return errors === 0 ? base : `${base.slice(0, -1)}; ${errors} failed.`
}

interface Recipient {
  userId: string
  barnId: string
  payload: number
}

function addRecipient(map: Map<string, Recipient>, userId: string | null, barnId: string): void {
  if (!userId) return
  const key = `${userId}:${barnId}`
  const existing = map.get(key)
  if (existing) existing.payload++
  else map.set(key, { userId, barnId, payload: 1 })
}

async function run(supabase: SupabaseClient): Promise<{ summary: string; hadErrors: boolean }> {
  const now = new Date()

  const barns = mustSucceed<{ id: string; slug: string; schedule_buffer_minutes: number }[]>(
    await supabase.from('barns').select('id, slug, schedule_buffer_minutes'),
    'select barns'
  )
  const slugByBarnId = new Map(barns.map((b) => [b.id, b.slug]))
  const bufferMinutesByBarnId = new Map(barns.map((b) => [b.id, b.schedule_buffer_minutes]))

  const series = mustSucceed<LessonSeries[]>(
    await supabase.from('lesson_series').select('*').eq('is_active', true),
    'select active lesson series'
  )

  const managersByBarn = new Map<string, string[]>()
  async function getBarnManagerUserIds(barnId: string): Promise<string[]> {
    const cached = managersByBarn.get(barnId)
    if (cached) return cached
    const managers = await getActiveManagerUserIds(barnId, supabase)
    managersByBarn.set(barnId, managers)
    return managers
  }

  const userIdByMembershipId = new Map<string, string | null>()
  async function getMembershipUserId(membershipId: string): Promise<string | null> {
    if (userIdByMembershipId.has(membershipId)) return userIdByMembershipId.get(membershipId) ?? null
    const row = mustSucceed<{ user_id: string | null } | null>(
      await supabase.from('barn_memberships').select('user_id').eq('id', membershipId).maybeSingle(),
      `select membership ${membershipId}`
    )
    const userId = row?.user_id ?? null
    userIdByMembershipId.set(membershipId, userId)
    return userId
  }

  let generatedCount = 0
  let stoppedCount = 0
  let warnedCount = 0
  let errorCount = 0
  const seriesStoppedRecipients = new Map<string, Recipient>()
  const horseWarningRecipients = new Map<string, Recipient>()
  const nearbyInstructorRecipients = new Map<string, Recipient>()

  async function stopSeriesAndNotify(s: LessonSeries): Promise<void> {
    await stopLessonSeries(s.id, s.barn_id, supabase)
    stoppedCount++
    if (s.instructor_id) addRecipient(seriesStoppedRecipients, await getMembershipUserId(s.instructor_id), s.barn_id)
    for (const managerId of await getBarnManagerUserIds(s.barn_id)) {
      addRecipient(seriesStoppedRecipients, managerId, s.barn_id)
    }
  }

  for (const s of series) {
    try {
      const latestRows = mustSucceed<{ lesson_at: string }[]>(
        await supabase.from('lessons').select('lesson_at').eq('series_id', s.id).order('lesson_at', { ascending: false }).limit(1),
        `select latest lesson for series ${s.id}`
      )
      const latestLessonAt = latestRows[0]?.lesson_at
      // A hard-deleted anchor lesson (#744) leaves no lessons row for this series — stop it here
      // instead of silently `continue`-ing forever, mirroring the missing-rider stop below
      if (!latestLessonAt) {
        await stopSeriesAndNotify(s)
        continue
      }
      if (!isDueForGeneration(latestLessonAt, now)) continue

      const memberships = mustSucceed<{ id: string; status: string }[]>(
        await supabase.from('barn_memberships').select('id, status').eq('barn_id', s.barn_id).in('id', s.rider_ids),
        `select riders for series ${s.id}`
      )

      if (hasMissingRider(s.rider_ids, memberships)) {
        await stopSeriesAndNotify(s)
        continue
      }

      const nextLessonAt = computeNextLessonAt(latestLessonAt)
      const newLesson = await generateNextLessonForSeries(s.id, s.barn_id, nextLessonAt, supabase)
      generatedCount++

      const nearbyMembershipIds = await getNearbyInstructorMembershipIds(
        s.barn_id, newLesson.id, newLesson.lesson_at, s.instructor_id, bufferMinutesByBarnId.get(s.barn_id) ?? 30, supabase
      )
      for (const membershipId of nearbyMembershipIds) {
        addRecipient(nearbyInstructorRecipients, await getMembershipUserId(membershipId), s.barn_id)
      }

      const horses = mustSucceed<{ id: string; is_active: boolean; is_available: boolean }[]>(
        await supabase.from('horses').select('id, is_active, is_available').eq('barn_id', s.barn_id).in('id', s.horse_ids),
        `select horses for series ${s.id}`
      )

      if (hasUnavailableHorse(s.horse_ids, horses)) {
        warnedCount++
        if (s.instructor_id) addRecipient(horseWarningRecipients, await getMembershipUserId(s.instructor_id), s.barn_id)
      }
    } catch (err) {
      errorCount++
      console.error(`Failed to process series ${s.id}:`, (err as Error).message)
    }
  }

  const linkForBarn = (barnId: string) => `/barn/${slugByBarnId.get(barnId) ?? ''}/lessons`

  errorCount += await upsertNotificationsForRecipients(
    supabase,
    seriesStoppedRecipients,
    formatSeriesStoppedNotification,
    'recurring_series_stopped',
    linkForBarn
  )
  errorCount += await upsertNotificationsForRecipients(
    supabase,
    horseWarningRecipients,
    formatHorseUnavailableNotification,
    'recurring_lesson_horse_unavailable',
    linkForBarn
  )
  errorCount += await upsertNotificationsForRecipients(
    supabase,
    nearbyInstructorRecipients,
    formatNearbyInstructorNotification,
    'instructor_lesson_nearby',
    linkForBarn
  )

  return {
    summary: formatGenerationSummary(generatedCount, stoppedCount, warnedCount, errorCount),
    hadErrors: errorCount > 0,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCronJob('generate-recurring-lessons', run)
}
