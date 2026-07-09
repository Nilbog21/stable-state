// The server fetches/renders on UTC day boundaries; comparing again here
// against the viewer's local day means a lesson/expense/reminder that isn't
// "today" yet in their timezone doesn't flash into the wrong section a day
// early. Server (SSR) and client hydration can compute `now` in different
// timezones, so a value right at the boundary could theoretically land
// differently between renders — an accepted tradeoff, paired with
// suppressHydrationWarning at each display site.
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function isSameLocalDay(date: Date, now: Date): boolean {
  return localToday(date) === localToday(now)
}
