import type { ReactNode } from 'react'

type Tone = 'amber' | 'yellow' | 'solid'

const toneClasses: Record<Tone, string> = {
  amber: 'rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5',
  yellow: 'rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 px-2 py-0.5',
  solid: 'rounded bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 px-1.5 py-0.5',
}

export function Badge({
  tone,
  className,
  children,
}: {
  tone: Tone
  className?: string
  children: ReactNode
}) {
  return (
    <span className={`text-xs font-medium whitespace-nowrap ${toneClasses[tone]}${className ? ` ${className}` : ''}`}>
      {children}
    </span>
  )
}
