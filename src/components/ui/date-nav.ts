/**
 * The circular Prev/Next control every date pager in the app is built from — the month calendar
 * picker's `<button>`s (#1019/#1020), the Finances page's month `<Link>`s, and the dashboard's
 * day/week ones (#1015).
 *
 * Raw Tailwind rather than `<Button>`: an icon-only unpadded circle has no good structural fit
 * with the shared component, which `src/components/ui/CLAUDE.md` names as a documented exception.
 * The colour tokens are `Pill`'s `pillInactive` ones deliberately, so the pagers track `Pill` if
 * that palette ever moves.
 *
 * One constant rather than a copy per surface (#1394). All three were hand-kept, and two had
 * already drifted by a token — Finances was missing `shrink-0` — while the pre-release checklist
 * carried a line asking a human to eyeball the pages every release to catch exactly that. A shared
 * import makes the claim true by construction, which is what let the line be deleted rather than
 * automated.
 *
 * `dateNavButtonClass`, not `monthNavButtonClass`: two of the three consumers page by month and the
 * dashboard's pages by day or week, so the shape is the date pager's, not the month's.
 *
 * A plain module rather than an export from `MonthCalendarPicker.tsx`, and that is load-bearing:
 * that file is `'use client'`, so every export of it becomes a client reference in the server
 * bundle and the two Server Components above would read a proxy rather than this string.
 *
 * The glyphs the callers pair with this are part of the pattern too: `&lt;`/`&gt;`, never the
 * guillemets, which render visibly smaller at the same font size.
 */
export const dateNavButtonClass =
  'flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-300 dark:hover:text-zinc-50'
