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
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // Path only — the full origin is only ever read inside handleCopy (an event handler,
  // guaranteed client-side), same as ManageMemberSection.tsx's invite-link copy, so this
  // component never touches `window` during a server render.
  const path = token ? `/calendar.ics?token=${token}` : ''

  async function handleGetLink() {
    setPending(true)
    setError(null)
    try {
      setToken(await getLinkAction())
    } catch {
      setError('Could not generate your calendar link. Please try again.')
    } finally {
      setPending(false)
    }
  }

  async function handleRegenerate() {
    setPending(true)
    setCopied(false)
    setError(null)
    try {
      setToken(await regenerateAction())
    } catch {
      setError('Could not regenerate your calendar link. Please try again.')
    } finally {
      setPending(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
    } catch {
      return
    }
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="mx-auto mb-8 max-w-md rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
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
          <code className="break-all rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">{path}</code>
          <Button type="button" variant="ghost" onClick={handleCopy} disabled={pending}>
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
          <Button type="button" variant="danger" onClick={handleRegenerate} loading={pending}>
            Regenerate
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}
