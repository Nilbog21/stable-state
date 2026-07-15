/**
 * Month resolution for the Finances pages — parses/clamps the `?month=YYYY-MM`
 * param and formats a resolved month back into that param value. Used by
 * `finances/page.tsx` and its three drill-down pages.
 */

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
  now: Date
): {
  startDate: Date
  endDate: Date
  monthLabel: string
  isCurrentMonth: boolean
  prevMonthUrl: string | null
  nextMonthUrl: string | null
} {
  const nowYear = now.getUTCFullYear()
  const nowMonth = now.getUTCMonth()

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

  const barnDate = new Date(barnCreatedAt)
  const barnYear = isNaN(barnDate.getTime()) ? 0 : barnDate.getUTCFullYear()
  const barnMonth = isNaN(barnDate.getTime()) ? 0 : barnDate.getUTCMonth()

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

  const monthLabel =
    new Date(Date.UTC(year, month, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }) +
    ' ' +
    year

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
