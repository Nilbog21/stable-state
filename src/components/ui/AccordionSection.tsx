import { cardBaseClass } from './Card'

/**
 * A collapsed-by-default card section (#1390 — lifted out of the Manage Barn settings page,
 * which was its only caller, so the horse detail page could use the same one).
 *
 * `hint` is the collapsed row's payload preview — "Documents · 2", "Access · 1 member". It
 * exists so a collapsed section still says whether opening it is worth a tap.
 *
 * `headerExtra` renders as an absolutely-positioned sibling of `<summary>` rather than inside
 * it, because a control inside a summary toggles the accordion instead of running its own
 * action.
 */
export function AccordionSection({
  title,
  hint,
  defaultOpen = false,
  headerExtra,
  children,
}: {
  title: string
  hint?: string
  defaultOpen?: boolean
  headerExtra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mb-6">
      <details open={defaultOpen} className={`relative ${cardBaseClass}`}>
        <summary
          className={`flex min-h-11 cursor-pointer items-center gap-2 px-4 py-3 ${headerExtra ? 'pr-32' : ''}`}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {title}
          </h2>
          {hint && (
            <span className="text-sm text-zinc-400 dark:text-zinc-500">{hint}</span>
          )}
        </summary>
        {headerExtra && (
          <div className="absolute right-4 top-0 flex h-11 items-center">{headerExtra}</div>
        )}
        <div className="border-t border-zinc-200 px-4 py-4 dark:border-zinc-700">{children}</div>
      </details>
    </div>
  )
}
