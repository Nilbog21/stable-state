'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'

interface Props {
  initialToken: string | null
  getLinkAction: () => Promise<string>
  regenerateAction: () => Promise<string>
}

export function CalendarFeedSection({ initialToken, getLinkAction, regenerateAction }: Props) {
  const [token, setToken] = useState(initialToken)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const url = token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/calendar.ics?token=${token}`
    : ''

  async function handleGetLink() {
    setPending(true)
    try {
      setToken(await getLinkAction())
    } finally {
      setPending(false)
    }
  }

  async function handleRegenerate() {
    setPending(true)
    setCopied(false)
    try {
      setToken(await regenerateAction())
    } finally {
      setPending(false)
    }
  }

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
    <section className="mb-8 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
        Calendar Feed
      </h2>
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        Subscribe to your schedule from your phone&apos;s calendar app (Google, Apple, Outlook).
        Refresh cadence is controlled by that app, not by us — most apps check every few hours,
        not instantly.
      </p>
      {!token ? (
        <Button type="button" onClick={handleGetLink} loading={pending}>
          Get my calendar link
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <code className="break-all rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">{url}</code>
          <Button type="button" variant="ghost" onClick={handleCopy} disabled={pending}>
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
          <Button type="button" variant="danger" onClick={handleRegenerate} loading={pending}>
            Regenerate
          </Button>
        </div>
      )}
    </section>
  )
}
