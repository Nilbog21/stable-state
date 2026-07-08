import Link from 'next/link'
import type { ComponentProps } from 'react'

type Variant = 'primary' | 'danger' | 'ghost'
type Size = 'sm' | 'md'

const base = 'inline-block font-medium disabled:opacity-50'
const sizes: Record<Size, string> = {
  md: 'min-h-11 rounded-md px-4 py-2 text-sm',
  sm: 'rounded px-3 py-1 text-xs',
}
const variants: Record<Variant, string> = {
  primary:
    'bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200',
  danger: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600',
  ghost:
    'border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800',
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
          className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : null}
      {children}
    </button>
  )
}
