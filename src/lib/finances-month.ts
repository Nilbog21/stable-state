/**
 * Month resolution for the Finances pages — parses/clamps the `?month=YYYY-MM`
 * param and formats a resolved month back into that param value. Used by
 * `finances/page.tsx` and its four drill-down pages.
 *
 * #1360: "current month" is the *barn's* month, resolved through `barnToday`, not the
 * server host's UTC month. Every zone in BARN_TIMEZONES is behind UTC, so the host rolls
 * over 4-10 hours early and a manager opening /finances in that window used to land on
 * next month's empty window — with `isCurrentMonth` and both pager URLs wrong too. Same
 * defect #1309 fixed one call further down the chain.
 *
 * `startDate`/`endDate` stay UTC-midnight `Date`s: their digits *are* the barn-local month
 * boundary, which is how downstream readers already treat them (see
 * `expense-finances.ts:fetchExpenseTransactionsInRange`).
 */
import { barnDay, barnToday } from './barn-timezone'
import { formatMonthHeading } from './local-day'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function pad4(n: number): string {
  return String(n).padStart(4, '0')
}

function toMonthIndex(year: number, month: number): number {
  return year * 12 + month
}

export function resolveFinancesMonth(
  monthParam: string | undefined,
  barnCreatedAt: string,
  timezone: string
): {
  startDate: Date
  endDate: Date
  monthLabel: string
  isCurrentMonth: boolean
  prevMonthUrl: string | null
  nextMonthUrl: string | null
} {
  const today = barnToday(timezone)
  const nowYear = parseInt(today.slice(0, 4), 10)
  const nowMonth = parseInt(today.slice(5, 7), 10) - 1

  let year = nowYear
  let month = nowMonth

  if (monthParam) {
    const parts = monthParam.split('-')
    const parsedYear = parseInt(parts[0], 10)
    const parsedMonth = parseInt(parts[1], 10) - 1
    if (
      parts.length === 2 &&
      !isNaN(parsedYear) &&
      !isNaN(parsedMonth) &&
      parsedMonth >= 0 &&
      parsedMonth <= 11
    ) {
      year = parsedYear
      month = parsedMonth
    }
  }

  // `barns.created_at` is a real instant, so the month it falls in is the barn's, not UTC's —
  // a barn created just after UTC midnight on the 1st was created *last* month locally.
  // The guard stays because `barnDay` would throw on an Invalid Date: an unparseable
  // timestamp degrades to no lower bound, as before.
  const barnDate = new Date(barnCreatedAt)
  const barnCreated = isNaN(barnDate.getTime()) ? null : barnDay(barnDate, timezone)
  const barnYear = barnCreated === null ? 0 : parseInt(barnCreated.slice(0, 4), 10)
  const barnMonth = barnCreated === null ? 0 : parseInt(barnCreated.slice(5, 7), 10) - 1

  if (toMonthIndex(year, month) < toMonthIndex(barnYear, barnMonth)) {
    year = barnYear
    month = barnMonth
  }
  if (toMonthIndex(year, month) > toMonthIndex(nowYear, nowMonth)) {
    year = nowYear
    month = nowMonth
  }

  const startDate = new Date(Date.UTC(year, month, 1))
  const isCurrentMonth = year === nowYear && month === nowMonth
  const endDate = new Date(Date.UTC(year, month + 1, 1))

  const monthLabel = formatMonthHeading(`${pad4(year)}-${pad2(month + 1)}`)

  const atBarnFirst = toMonthIndex(year, month) === toMonthIndex(barnYear, barnMonth)
  let prevMonthUrl: string | null = null
  if (!atBarnFirst) {
    const prevYear = month === 0 ? year - 1 : year
    const prevMonth = month === 0 ? 11 : month - 1
    prevMonthUrl = `?month=${pad4(prevYear)}-${pad2(prevMonth + 1)}`
  }

  let nextMonthUrl: string | null = null
  if (!isCurrentMonth) {
    const nextYear = month === 11 ? year + 1 : year
    const nextMonth = month === 11 ? 0 : month + 1
    nextMonthUrl = `?month=${pad4(nextYear)}-${pad2(nextMonth + 1)}`
  }

  return { startDate, endDate, monthLabel, isCurrentMonth, prevMonthUrl, nextMonthUrl }
}

export function formatMonthParam(date: Date): string {
  return `${pad4(date.getUTCFullYear())}-${pad2(date.getUTCMonth() + 1)}`
}
