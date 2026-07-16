'use client'
import { useOutsideDismiss } from '@/components/useOutsideDismiss'
import { BlockingLink } from './NavigationBlocker'

interface Props {
  barnName: string
  barnSlug: string
  activeBarnMemberships: { slug: string; name: string }[]
}

export function BarnSwitcher({ barnName, barnSlug, activeBarnMemberships }: Props) {
  const showSwitchBarn = activeBarnMemberships.length > 1
  const { open, setOpen, ref } = useOutsideDismiss(showSwitchBarn)

  if (!showSwitchBarn) {
    return (
      <BlockingLink
        href={`/barn/${barnSlug}`}
        className="text-sm font-semibold text-zinc-900 hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
      >
        {barnName}
      </BlockingLink>
    )
  }

  return (
    <div ref={ref} className="relative flex items-center">
      <BlockingLink
        href={`/barn/${barnSlug}`}
        className="text-sm font-semibold text-zinc-900 hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
        onClick={() => setOpen(false)}
      >
        {barnName}
      </BlockingLink>
      {/* Raw Tailwind, not <Button>: icon-only unpadded caret trigger — same
          reasoning as NotificationBell's bell trigger. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Switch barn"
        aria-expanded={open}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 min-w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-md dark:border-zinc-700 dark:bg-zinc-900">
          {activeBarnMemberships.map((m) =>
            m.slug === barnSlug ? (
              <span
                key={m.slug}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-50"
              >
                <span aria-hidden="true">✓</span>
                {m.name}
              </span>
            ) : (
              <BlockingLink
                key={m.slug}
                href={`/barn/${m.slug}`}
                className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                onClick={() => setOpen(false)}
              >
                {m.name}
              </BlockingLink>
            )
          )}
        </div>
      )}
    </div>
  )
}
