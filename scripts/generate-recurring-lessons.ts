import { fileURLToPath } from 'url'
import { generateNextLessonForSeries, stopLessonSeries } from '@/lib/db/lesson-series'
import { upsertNotification } from '@/lib/db/notifications'
import { createServiceClient, mustSucceed } from './script-utils'
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
    body: `${count} recurring lesson series ${count === 1 ? 'was' : 'were'} stopped because a rider is no longer a member.`,
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

interface RecipientCount {
  userId: string
  barnId: string
  count: number
}

function addRecipient(map: Map<string, RecipientCount>, userId: string | null, barnId: string): void {
  if (!userId) return
  const key = `${userId}:${barnId}`
  const existing = map.get(key)
  if (existing) existing.count++
  else map.set(key, { userId, barnId, count: 1 })
}

async function run() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

  const supabase = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const now = new Date()

  const barns = mustSucceed<{ id: string; slug: string }[]>(await supabase.from('barns').select('id, slug'), 'select barns')
  const slugByBarnId = new Map(barns.map((b) => [b.id, b.slug]))

  const series = mustSucceed<LessonSeries[]>(
    await supabase.from('lesson_series').select('*').eq('is_active', true),
    'select active lesson series'
  )

  const managersByBarn = new Map<string, string[]>()
  async function getBarnManagerUserIds(barnId: string): Promise<string[]> {
    const cached = managersByBarn.get(barnId)
    if (cached) return cached
    const rows = mustSucceed<{ user_id: string | null }[]>(
      await supabase.from('barn_memberships').select('user_id').eq('barn_id', barnId).eq('role', 'manager').eq('status', 'active'),
      `select managers for barn ${barnId}`
    )
    const managers = rows.map((r) => r.user_id).filter((id): id is string => id !== null)
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
  const seriesStoppedRecipients = new Map<string, RecipientCount>()
  const horseWarningRecipients = new Map<string, RecipientCount>()

  for (const s of series) {
    try {
      const latestRows = mustSucceed<{ lesson_at: string }[]>(
        await supabase.from('lessons').select('lesson_at').eq('series_id', s.id).order('lesson_at', { ascending: false }).limit(1),
        `select latest lesson for series ${s.id}`
      )
      const latestLessonAt = latestRows[0]?.lesson_at
      if (!latestLessonAt || !isDueForGeneration(latestLessonAt, now)) continue

      const memberships = mustSucceed<{ id: string; status: string }[]>(
        await supabase.from('barn_memberships').select('id, status').eq('barn_id', s.barn_id).in('id', s.rider_ids),
        `select riders for series ${s.id}`
      )

      if (hasMissingRider(s.rider_ids, memberships)) {
        await stopLessonSeries(s.id, s.barn_id, supabase)
        stoppedCount++
        if (s.instructor_id) addRecipient(seriesStoppedRecipients, await getMembershipUserId(s.instructor_id), s.barn_id)
        for (const managerId of await getBarnManagerUserIds(s.barn_id)) {
          addRecipient(seriesStoppedRecipients, managerId, s.barn_id)
        }
        continue
      }

      const nextLessonAt = computeNextLessonAt(latestLessonAt)
      await generateNextLessonForSeries(s.id, s.barn_id, nextLessonAt, supabase)
      generatedCount++

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

  for (const recipient of seriesStoppedRecipients.values()) {
    try {
      const link = `/barn/${slugByBarnId.get(recipient.barnId) ?? ''}/lessons`
      const { title, body } = formatSeriesStoppedNotification(recipient.count)
      await upsertNotification(supabase, {
        userId: recipient.userId,
        barnId: recipient.barnId,
        type: 'recurring_series_stopped',
        title,
        body,
        link,
      })
    } catch (err) {
      errorCount++
      console.error(`Failed to notify ${recipient.userId} of stopped series:`, (err as Error).message)
    }
  }
  for (const recipient of horseWarningRecipients.values()) {
    try {
      const link = `/barn/${slugByBarnId.get(recipient.barnId) ?? ''}/lessons`
      const { title, body } = formatHorseUnavailableNotification(recipient.count)
      await upsertNotification(supabase, {
        userId: recipient.userId,
        barnId: recipient.barnId,
        type: 'recurring_lesson_horse_unavailable',
        title,
        body,
        link,
      })
    } catch (err) {
      errorCount++
      console.error(`Failed to notify ${recipient.userId} of unavailable horse:`, (err as Error).message)
    }
  }

  console.log(formatGenerationSummary(generatedCount, stoppedCount, warnedCount, errorCount))
  if (errorCount > 0) process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('generate-recurring-lessons failed:', err.message)
    process.exit(1)
  })
}
