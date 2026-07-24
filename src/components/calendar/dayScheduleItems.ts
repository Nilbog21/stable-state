import type { ScheduleItem, LessonWithDetails, ExpenseWithHorses, ScheduledExpense, BarnEvent } from '@/lib/db/types'

export type DayScheduleDisplayItem =
  | { itemType: 'lesson'; id: string; lesson: LessonWithDetails }
  | { itemType: 'expense'; id: string; expense: ScheduledExpense }
  | { itemType: 'event'; id: string; event: BarnEvent }

// Walks `items` (already correctly sorted by getScheduleForRange) and resolves each id
// against its matching hydrated list. An id with no match is silently dropped -- this is how
// the dashboard's "planned expenses only" filter is applied: the caller passes in an
// already-filtered expense list, so a paid expense's schedule-item id just won't resolve.
export function mergeDayScheduleDisplayItems(
  items: ScheduleItem[],
  lessons: LessonWithDetails[],
  expenses: ExpenseWithHorses[],
  events: BarnEvent[]
): DayScheduleDisplayItem[] {
  const lessonsById = new Map(lessons.map((l) => [l.id, l]))
  const expensesById = new Map(expenses.map((e) => [e.id, e]))
  const eventsById = new Map(events.map((e) => [e.id, e]))

  const result: DayScheduleDisplayItem[] = []
  for (const item of items) {
    if (item.itemType === 'lesson') {
      const lesson = lessonsById.get(item.id)
      if (lesson) result.push({ itemType: 'lesson', id: item.id, lesson })
    } else if (item.itemType === 'expense') {
      const expense = expensesById.get(item.id)
      // getScheduleForRange only ever surfaces expense ids with a non-null expense_time.
      if (expense) result.push({ itemType: 'expense', id: item.id, expense: expense as ScheduledExpense })
    } else {
      const event = eventsById.get(item.id)
      if (event) result.push({ itemType: 'event', id: item.id, event })
    }
  }
  return result
}
