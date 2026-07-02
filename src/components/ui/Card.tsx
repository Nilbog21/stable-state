import Link from 'next/link'
import type { ReactNode } from 'react'

const base =
  'block rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900'

export function Card({ href, children }: { href?: string; children: ReactNode }) {
  if (href) {
    return (
      <Link
        href={href}
        className={`${base} hover:border-zinc-300 hover:bg-zinc-50 dark:hover:border-zinc-600 dark:hover:bg-zinc-800`}
      >
        {children}
      </Link>
    )
  }
  return <div className={base}>{children}</div>
}
