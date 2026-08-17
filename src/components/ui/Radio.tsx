import type { ComponentProps } from 'react'

/**
 * Exported so `Radio.test.tsx` can read the colours back out and assert each pair clears WCAG's 3:1
 * floor for non-text UI components. Literal strings rather than a `border-${name}` template because
 * Tailwind 4 only emits classes it can see spelled out in the source -- so these strings are the
 * single source of truth and the test parses them the way the browser does.
 *
 * The resting ring is `zinc-500` for `Switch`'s reason: `zinc-300` is the instinctive choice and
 * disappears against a white page at 1.2:1, and one colour serves both schemes because `zinc-600`
 * on the zinc-950 page is 2.57:1 -- a darker off state would recede out of existence rather than
 * read as unselected.
 */
export const radioRingClasses = {
  on: 'border-zinc-900 dark:border-zinc-50',
  off: 'border-zinc-500',
}
export const radioDotClasses = {
  on: 'bg-zinc-900 dark:bg-zinc-50',
  off: 'bg-transparent',
}

/**
 * One option of a single-select that commits immediately -- `Switch`'s state idiom where the choice
 * is one of three rather than on/off (#1549). Use it wherever picking one value out of a small
 * fixed set commits on tap; `<Pill>` is for switching views, and a variant swap on a `Button` is
 * never the answer.
 *
 * A `<button type="submit">`, not an `<input type="radio">`, for the reason #1548 declined to make
 * the horse Access table's Documents column native radios: every call site sits inside a
 * `<form action={boundServerAction}>` and has to work before React hydrates (#1390 -- those
 * controls were script-only no-ops in that window, on a page a manager lands on and immediately
 * clicks). A native radio commits through `onChange`, which is exactly that defect, and the only
 * no-JS alternative is a Save button per row, which #1390 also removed. So this takes the radio's
 * vocabulary and leaves its plumbing: one form and one submit per option, as before.
 *
 * `label` is visible text, unlike `Switch`'s `label` -- a radio's label names the *option*, which
 * the user has to read to pick between three of them. Which option is current is `aria-checked`'s
 * job and the dot's.
 *
 * No `className` escape hatch, deliberately -- same reasoning as `Badge`'s and `Switch`'s. Wrap it
 * for spacing instead.
 */
export function Radio({
  checked,
  label,
  type = 'submit',
  ...rest
}: Omit<ComponentProps<'button'>, 'children' | 'className'> & {
  checked: boolean
  label: string
}) {
  const state = checked ? 'on' : 'off'

  return (
    <button
      {...rest}
      type={type}
      role="radio"
      aria-checked={checked}
      className="inline-flex min-h-11 items-center gap-2 pr-2 text-sm whitespace-nowrap"
    >
      <span
        aria-hidden
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${radioRingClasses[state]}`}
      >
        <span className={`block h-2.5 w-2.5 rounded-full ${radioDotClasses[state]}`} />
      </span>
      {label}
    </button>
  )
}
