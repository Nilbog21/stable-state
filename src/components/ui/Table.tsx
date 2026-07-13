import type { ComponentProps } from 'react'

const th =
  'border-b border-zinc-200 pb-2 pr-6 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 last:pr-0 dark:border-zinc-700 dark:text-zinc-400'
const tones = {
  primary: 'text-zinc-900 dark:text-zinc-50',
  secondary: 'text-zinc-500 dark:text-zinc-400',
}

type TdProps = ComponentProps<'td'> & { tone?: keyof typeof tones }

export function Th({ className, ...rest }: ComponentProps<'th'>) {
  return <th {...rest} className={`${th}${className ? ` ${className}` : ''}`} />
}

export function Td({ tone = 'primary', className, ...rest }: TdProps) {
  const td = `border-b border-zinc-100 py-3 pr-6 text-sm ${tones[tone]} last:pr-0 dark:border-zinc-800`
  return <td {...rest} className={`${td}${className ? ` ${className}` : ''}`} />
}

export function TableActions({ className, children, ...rest }: TdProps) {
  return (
    <Td {...rest} className={`text-right${className ? ` ${className}` : ''}`}>
      <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap">{children}</span>
    </Td>
  )
}
