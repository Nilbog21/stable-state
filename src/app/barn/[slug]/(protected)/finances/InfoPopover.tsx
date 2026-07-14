'use client'
import { useState } from 'react'

export function InfoPopover({ text, align = 'right' }: { text: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block">
      {/* Raw Tailwind, not <Button>: icon-only unpadded info trigger — same
          reasoning as NotificationBell's bell trigger. */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="ml-1 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        aria-label="Info"
      >
        ⓘ
      </button>
      {open && (
        <span
          className={`absolute top-6 z-10 w-48 rounded-md border border-zinc-200 bg-white p-2 text-xs text-zinc-700 shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 ${align === 'left' ? 'left-0' : 'right-0'}`}
        >
          {text}
        </span>
      )}
    </span>
  )
}
