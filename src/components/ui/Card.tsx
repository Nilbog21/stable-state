import Link from 'next/link'
import type { ReactNode } from 'react'

const base = 'rounded-lg border border-zinc-200 dark:border-zinc-700'

export function Card({
  href,
  className = '',
  children,
}: {
  href?: string
  className?: string
  children: ReactNode
}) {
  if (href) {
    return (
      <Link
        href={href}
        className={`${base} block bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 ${className}`}
      >
        {children}
      </Link>
    )
  }
  return <div className={`${base} ${className}`}>{children}</div>
}
