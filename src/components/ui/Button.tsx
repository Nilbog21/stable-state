import Link from 'next/link'
import type { ComponentProps } from 'react'

type Variant = 'primary' | 'danger' | 'ghost' | 'warning'
type Size = 'sm' | 'md'

const base = 'inline-flex items-center justify-center gap-2 font-medium disabled:opacity-50'
const sizes: Record<Size, string> = {
  md: 'min-h-11 rounded-md px-4 py-2 text-sm',
  sm: 'min-h-11 rounded px-3 py-1 text-xs',
}
const variants: Record<Variant, string> = {
  primary:
    'bg-zinc-900 text-white hover:bg-zinc-700 active:bg-zinc-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:active:bg-zinc-300',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 dark:bg-red-700 dark:hover:bg-red-600 dark:active:bg-red-500',
  ghost:
    'border border-zinc-300 text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:active:bg-zinc-700',
  warning:
    'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 active:bg-amber-200 dark:border-amber-800/40 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 dark:active:bg-amber-900/70',
}

export function Button({
  href,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  type = 'button',
  children,
  ...rest
}: ComponentProps<'button'> & {
  href?: string
  variant?: Variant
  size?: Size
  loading?: boolean
}) {
  const classes = `${base} ${sizes[size]} ${variants[variant]}${className ? ` ${className}` : ''}`

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      className={classes}
    >
      {loading ? (
        <span
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : null}
      {children}
    </button>
  )
}
