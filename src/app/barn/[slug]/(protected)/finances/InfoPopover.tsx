'use client'
import { useState } from 'react'

export function InfoPopover({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="ml-1 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        aria-label="Info"
      >
        ⓘ
      </button>
      {open && (
        <span className="absolute right-0 top-6 z-10 w-48 rounded-md border border-zinc-200 bg-white p-2 text-xs text-zinc-700 shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {text}
        </span>
      )}
    </span>
  )
}
