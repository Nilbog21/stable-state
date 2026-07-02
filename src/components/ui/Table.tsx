import type { ComponentProps } from 'react'

const th =
  'border-b border-zinc-200 pb-2 pr-6 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 last:pr-0 dark:border-zinc-700 dark:text-zinc-400'
const td =
  'border-b border-zinc-100 py-3 pr-6 text-sm text-zinc-900 last:pr-0 dark:border-zinc-800 dark:text-zinc-50'

export function Th({ className, ...rest }: ComponentProps<'th'>) {
  return <th {...rest} className={`${th}${className ? ` ${className}` : ''}`} />
}

export function Td({ className, ...rest }: ComponentProps<'td'>) {
  return <td {...rest} className={`${td}${className ? ` ${className}` : ''}`} />
}

export function TableActions({ className, ...rest }: ComponentProps<'td'>) {
  return <Td {...rest} className={`text-right${className ? ` ${className}` : ''}`} />
}
