import Link from 'next/link'
import type { ReactNode } from 'react'

const pillBase =
  'inline-flex min-h-11 items-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors'
const pillActive = 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
const pillInactive = 'border border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-300 dark:hover:text-zinc-50'

export function Pill({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} scroll={false} className={`${pillBase} ${active ? pillActive : pillInactive}`}>
      {children}
    </Link>
  )
}
