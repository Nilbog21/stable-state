import type { ComponentProps } from 'react'

type Variant = 'primary' | 'danger' | 'ghost'

const base = 'rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50'
const variants: Record<Variant, string> = {
  primary:
    'bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200',
  danger: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600',
  ghost:
    'border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800',
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  ...rest
}: ComponentProps<'button'> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`${base} ${variants[variant]}`}
    >
      {loading ? (
        <span className="mr-2 inline-block animate-spin" aria-hidden>
          ◌
        </span>
      ) : null}
      {children}
    </button>
  )
}
