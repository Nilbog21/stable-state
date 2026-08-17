import type { ComponentProps } from 'react'

/**
 * Exported so `Switch.test.tsx` can read the fills back out and assert each pair clears WCAG's 3:1
 * floor for non-text UI components. Literal strings rather than a `bg-${name}` template because
 * Tailwind 4 only emits classes it can see spelled out in the source -- so these strings are the
 * single source of truth and the test parses them the way the browser does.
 *
 * The off track is `zinc-500`, not the instinctive `zinc-300`: white-on-zinc-300 is 1.2:1, so the
 * knob would vanish into it. It is also one colour in both schemes — `zinc-600` on the zinc-950
 * page is 2.57:1, below the floor, so a darker off state would disappear rather than recede.
 */
export const switchTrackClasses = {
  on: 'bg-zinc-900 dark:bg-zinc-50',
  off: 'bg-zinc-500',
}
export const switchKnobClasses = {
  on: 'bg-white dark:bg-zinc-900',
  off: 'bg-white',
}

/**
 * An on/off control that commits immediately — the state idiom, as opposed to `Button`'s
 * de-emphasis idiom (#1548). Use it wherever a boolean flips on tap; a checkbox is for a field a
 * Save button commits later, and a variant swap on a `Button` is never the answer.
 *
 * A `<button type="submit">`, not an `<input type="checkbox">`, because every call site sits inside
 * a `<form action={boundServerAction}>` and has to work before React hydrates (#1390 — the horse
 * Access table's controls were script-only no-ops in that window, on a page a manager lands on and
 * immediately clicks). A checkbox would need an `onChange` to commit, which is exactly that defect.
 *
 * `label` is the accessible name and carries no state: which way the switch is thrown is
 * `aria-checked`'s job and the knob's, so the name can stay stable across taps.
 *
 * No `className` escape hatch, deliberately — same reasoning as `Badge`'s. A switch that can be
 * restyled per call site is a switch whose two states can be made ambiguous per call site, which
 * is the ambiguity this component exists to remove. Wrap it for spacing instead.
 */
export function Switch({
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
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="inline-flex min-h-11 min-w-11 items-center justify-center"
    >
      <span
        aria-hidden
        className={`relative block h-6 w-11 rounded-full transition-colors ${switchTrackClasses[state]}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 block h-5 w-5 rounded-full transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          } ${switchKnobClasses[state]}`}
        />
      </span>
    </button>
  )
}
