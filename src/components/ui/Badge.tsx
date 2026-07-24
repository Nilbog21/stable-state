import type { ReactNode } from 'react'

type Tone = 'amber' | 'solid'

const toneClasses: Record<Tone, string> = {
  amber: 'rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5',
  solid: 'rounded bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 px-1.5 py-0.5',
}

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
