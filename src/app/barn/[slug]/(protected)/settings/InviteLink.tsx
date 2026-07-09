'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'

export default function InviteLink({ slug }: { slug: string }) {
  const [url] = useState(() =>
    typeof window !== 'undefined'
      ? `${window.location.origin}/barn/${slug}/register`
      : /* v8 ignore next */ ''
  )
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      return
    }
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="mb-12">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Invite Link
      </h2>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={url}
          suppressHydrationWarning
          className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
        />
        <Button type="button" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
    </section>
  )
}
