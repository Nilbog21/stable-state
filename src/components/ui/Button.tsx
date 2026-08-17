import Link from 'next/link'
import type { ComponentProps } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'warning'
type Size = 'sm' | 'md'

/**
 * Exported so `Button.test.tsx` can enumerate the variants and assert each one declares its own
 * disabled colours and clears WCAG AA -- a `Variant` union alone doesn't exist at runtime. Same
 * reason `Badge` exports `toneClasses`.
 */
export const buttonBase = 'inline-flex items-center justify-center gap-2 font-medium'
export const buttonSizes: Record<Size, string> = {
  md: 'min-h-11 rounded-md px-4 py-2 text-sm',
  sm: 'min-h-11 rounded px-3 py-1 text-xs',
}

/**
 * There is deliberately no unfilled variant. Until #1548 a `ghost` — `border-zinc-300
 * text-zinc-700` — carried both de-prioritised actions and on/off state, and the only disabled cue
 * in the component was `disabled:opacity-50` over those same classes, so enabled and disabled
 * landed at nearly the same weight and Edit buttons read as greyed out. Every variant now owns its
 * disabled pair, which is what makes the difference a declared colour rather than an alpha
 * multiplier. State is `Switch` or a segmented group of these, never a variant swap.
 */
export const buttonVariants: Record<Variant, string> = {
  primary:
    'bg-zinc-900 text-white hover:bg-zinc-700 active:bg-zinc-600 disabled:bg-zinc-300 disabled:text-zinc-500 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:active:bg-zinc-300 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500',
  secondary:
    'bg-zinc-200 text-zinc-900 hover:bg-zinc-300 active:bg-zinc-400 disabled:bg-zinc-100 disabled:text-zinc-400 dark:bg-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-600 dark:active:bg-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-200 disabled:text-red-400 dark:bg-red-700 dark:hover:bg-red-600 dark:active:bg-red-500 dark:disabled:bg-red-950 dark:disabled:text-red-500',
  // Disabled drains the amber rather than dimming it: the whole point of the variant is to draw
  // attention, so a paler amber still reads as "look here" where a neutral grey reads as "not now".
  warning:
    'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 active:bg-amber-200 disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-amber-800/40 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 dark:active:bg-amber-900/70 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600',
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
  const classes = `${buttonBase} ${buttonSizes[size]} ${buttonVariants[variant]}${className ? ` ${className}` : ''}`

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
