import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { instantToLocalWallClock } from '@/lib/barn-timezone'
import { getLessonJunctionRows } from './lesson-finance-queries'
import type { ScheduleItem } from './types'

/**
 * Merged, duration-aware read of `lessons` + `horse_expenses` for availability/conflict
 * checking (#1013). No physical `events` table — mirrors the existing `agreement_charges`
 * vs. lessons precedent in Finances; a UNION across two indexed tables isn't a real
 * bottleneck at barn scale. Raw-row fetch + merge only, no name resolution — same idiom as
 * lesson-finance-queries.ts.
 */

export const LESSON_DURATION_MINUTES = 60

interface ScheduleLessonRow {
  id: string
  start: string // barn-local wall clock, see ScheduleItem.start
  instructor_id: string | null
  horse_ids: string[]
}

interface ScheduleExpenseRow {
  id: string
  start: string // barn-local wall clock, see ScheduleItem.start
  horse_ids: string[]
}

// Half-open interval [start, start + durationMinutes) — an item ending exactly when
// another starts does not count as overlapping (e.g. back-to-back 9-10 and 10-11
// lessons aren't a conflict). Standard scheduling convention; symmetric/transitive.
//
// new Date(item.start) parses the barn-local wall-clock string as local-to-the-server-
// process, which would be wrong for *display* (see #935/#955) but is fine here — both
// operands get the same (consistent, if arbitrary) offset assumption, which cancels out
// in the subtraction. This function is never used for display, only relative comparison.
export function intervalsOverlap(a: ScheduleItem, b: ScheduleItem): boolean {
  const aStart = new Date(a.start).getTime()
  const aEnd = aStart + a.durationMinutes * 60_000
  const bStart = new Date(b.start).getTime()
  const bEnd = bStart + b.durationMinutes * 60_000
  return aStart < bEnd && bStart < aEnd
}

export function mergeScheduleItems(lessons: ScheduleLessonRow[], expenses: ScheduleExpenseRow[]): ScheduleItem[] {
  const lessonItems: ScheduleItem[] = lessons.map((l) => ({
    id: l.id,
    itemType: 'lesson',
    start: l.start,
    durationMinutes: LESSON_DURATION_MINUTES,
    instructorId: l.instructor_id,
    horseIds: l.horse_ids,
  }))
  const expenseItems: ScheduleItem[] = expenses.map((e) => ({
    id: e.id,
    itemType: 'expense',
    start: e.start,
    durationMinutes: 0,
    instructorId: null,
    horseIds: e.horse_ids,
  }))
  return [...lessonItems, ...expenseItems].sort((a, b) => a.start.localeCompare(b.start))
}

/**
 * `from`/`to` are real UTC instants (matches getUpcomingLessons' convention).
 * `timezone` (barns.timezone) is required — horse_expenses.expense_date/expense_time are
 * barn-local wall-clock digits, not real instants (see expenses.ts:getUpcomingScheduledExpenses),
 * so ScheduleItem.start normalizes everything down into that same barn-local frame rather
 * than inventing a wall-clock-to-instant conversion.
 *
 * RLS is respected as-is, no new grants: horse_expenses SELECT is manager-only, so a
 * trainer/rider caller gets lesson items back with no expense items, silently (zero rows,
 * not an error).
 */
export async function getScheduleForRange(
  barnId: string,
  from: string,
  to: string,
  timezone: string,
  client?: SupabaseClient
): Promise<ScheduleItem[]> {
  const supabase = client ?? await createClient()

  const { data: lessonData, error: lessonsError } = await supabase
    .from('lessons')
    .select('id, lesson_at, instructor_id')
    .eq('barn_id', barnId)
    .is('cancelled_at', null)
    .gte('lesson_at', from)
    .lt('lesson_at', to)
  if (lessonsError) throw lessonsError

  const lessons = (lessonData ?? []) as { id: string; lesson_at: string; instructor_id: string | null }[]
  const lessonIds = lessons.map((l) => l.id)
  const lessonHorseRows = lessonIds.length
    ? await getLessonJunctionRows('lesson_horses', 'horse_id', barnId, lessonIds, supabase)
    : []
  const lessonHorseIdsByLessonId = new Map<string, string[]>()
  for (const row of lessonHorseRows) {
    const list = lessonHorseIdsByLessonId.get(row.lesson_id) ?? []
    list.push(row.horse_id)
    lessonHorseIdsByLessonId.set(row.lesson_id, list)
  }

  const scheduleLessonRows: ScheduleLessonRow[] = lessons.map((l) => ({
    id: l.id,
    start: instantToLocalWallClock(new Date(l.lesson_at), timezone),
    instructor_id: l.instructor_id,
    horse_ids: lessonHorseIdsByLessonId.get(l.id) ?? [],
  }))

  // Mirrors getUpcomingScheduledExpenses (expenses.ts): coarse DB-level date bound, then a
  // precise JS-side wall-clock comparison, since expense_date/expense_time are barn-local
  // digits with no timezone info of their own to compare against real instants directly.
  const fromWall = instantToLocalWallClock(new Date(from), timezone)
  const toWall = instantToLocalWallClock(new Date(to), timezone)

  const { data: expenseData, error: expensesError } = await supabase
    .from('horse_expenses')
    .select('id, expense_date, expense_time')
    .eq('barn_id', barnId)
    .not('expense_time', 'is', null)
    .gte('expense_date', fromWall.slice(0, 10))
    .lte('expense_date', toWall.slice(0, 10))
  if (expensesError) throw expensesError

  const expenseCandidates = ((expenseData ?? []) as { id: string; expense_date: string; expense_time: string | null }[])
    .filter((e) => e.expense_time !== null)
    .map((e) => ({ id: e.id, wallClock: `${e.expense_date}T${e.expense_time}` }))
    .filter((e) => e.wallClock >= fromWall && e.wallClock < toWall)

  const expenseIds = expenseCandidates.map((e) => e.id)
  let expenseHorseRows: { expense_id: string; horse_id: string }[] = []
  if (expenseIds.length) {
    const { data: junctionData, error: junctionError } = await supabase
      .from('expense_horses')
      .select('expense_id, horse_id')
      .eq('barn_id', barnId)
      .in('expense_id', expenseIds)
    if (junctionError) throw junctionError
    expenseHorseRows = (junctionData ?? []) as { expense_id: string; horse_id: string }[]
  }
  const expenseHorseIdsByExpenseId = new Map<string, string[]>()
  for (const row of expenseHorseRows) {
    const list = expenseHorseIdsByExpenseId.get(row.expense_id) ?? []
    list.push(row.horse_id)
    expenseHorseIdsByExpenseId.set(row.expense_id, list)
  }

  const scheduleExpenseRows: ScheduleExpenseRow[] = expenseCandidates.map((e) => ({
    id: e.id,
    start: e.wallClock,
    horse_ids: expenseHorseIdsByExpenseId.get(e.id) ?? [],
  }))

  return mergeScheduleItems(scheduleLessonRows, scheduleExpenseRows)
}
