import Link from 'next/link'
import type { HorseExertionSummary } from '@/lib/db/types'

export function HorseCard({
  horse,
  barnSlug,
  variant,
}: {
  horse: HorseExertionSummary
  barnSlug: string
  variant: 'available' | 'unavailable' | 'inactive'
}) {
  return (
    <Link
      href={`/barn/${barnSlug}/horses/${horse.id}`}
      className="block rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
    >
      <span className="font-medium text-zinc-900 dark:text-zinc-50">{horse.name}</span>
      {variant === 'available' && (
        <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
          Exertion: {horse.totalExertion} · {horse.lessonCount} lessons · {horse.jumpingCount} jumping (7d)
        </span>
      )}
      {variant === 'unavailable' && (
        <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
          {horse.unavailability_reason ?? 'No reason given'}
        </span>
      )}
    </Link>
  )
}
