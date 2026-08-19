import type { ReactNode } from 'react'

// Exported so Badge.test.tsx can enumerate the tones and assert each one clears
// WCAG AA -- a `Tone` union alone doesn't exist at runtime.
export const toneClasses = {
  amber: 'rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5',
  red: 'rounded-full bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 px-2 py-0.5',
  green: 'rounded-full bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 px-2 py-0.5',
  // The dark border is load-bearing, not decoration: gray sits both on the
  // zinc-950 page (lesson detail) and inside a Card whose dark hover is
  // zinc-800 (lessons list), so no single dark background is distinct from
  // every surface -- #768 picked zinc-950 for the card, this tone picked
  // zinc-800 for the page, and each vanishes on the other's surface. The
  // border makes the pill's edge visible regardless of what it sits on.
  gray: 'rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:border dark:border-zinc-700 px-2 py-0.5',
}

type Tone = keyof typeof toneClasses

export function Badge({
  tone,
  children,
}: {
  tone: Tone
  children: ReactNode
}) {
  return (
    <span className={`text-xs font-medium whitespace-nowrap ${toneClasses[tone]}`}>
      {children}
    </span>
  )
}
