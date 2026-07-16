'use client'
import { useState } from 'react'
import { cardBaseClass } from '@/components/ui/Card'

// Raw Tailwind, not <Card>: needs to render as a <button> so the whole
// card is the info-popover tap target (Card's API only supports a <div>
// or a <Link>), reusing Card's own border/rounded styling for consistency.
export function SummaryStatCard({ label, value, infoText }: { label: string; value: string; infoText: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className={`${cardBaseClass} relative w-full bg-white p-4 text-left dark:bg-zinc-900`}
    >
      <section>
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label} <span aria-hidden="true">ⓘ</span>
        </p>
        <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">{value}</p>
      </section>
      {open && (
        <span className="absolute left-4 top-full z-10 mt-1 w-48 rounded-md border border-zinc-200 bg-white p-2 text-xs font-normal normal-case tracking-normal text-zinc-700 shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {infoText}
        </span>
      )}
    </button>
  )
}
