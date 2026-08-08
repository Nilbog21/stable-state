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
  // Nothing disables either button while writeText is awaiting — `pending` only goes true
  // once Regenerate is clicked — so a copy can still be in flight when Regenerate
  // supersedes its token. Bump on Regenerate and drop a copy that resumes on the far side
  // of it, or it re-sets error/copied for a token that no longer exists. ManageMemberSection's
  // Revoke used to share this ref; #1396 replaced it there with currency derived at render, which
  // closes the window this bump-and-check leaves open when a copy settles in the same tick as a
  // failed action. This surface still latches, so the two have diverged again (#1116 converged
  // them).
  const copyGenerationRef = useRef(0)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

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
    copyGenerationRef.current += 1
    try {
      setToken(await regenerateAction())
    } catch {
      // Nothing was superseded — hand the generation back so a copy still in flight is
      // still allowed to report its own outcome. Safe to decrement rather than track a
      // snapshot: both buttons are `pending`-disabled for the whole regenerate flight, so
      // nothing else can bump concurrently.
      copyGenerationRef.current -= 1
      setError('Could not regenerate your calendar link. Please try again.')
    } finally {
      setPending(false)
    }
  }

  // The URL is never rendered — it's built here, inside an event handler (guaranteed
  // client-side), so the component never touches `window` during a server render. Same as
  // ManageMemberSection.tsx's invite-link copy. Since there's no on-screen copy to fall back
  // on, a failed write has to say so: writeText needs a secure context, so it does fail when
  // hitting the dev server over LAN HTTP from a phone.
  async function handleCopy() {
    const generation = copyGenerationRef.current
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/calendar.ics?token=${token}`
      )
    } catch {
      if (copyGenerationRef.current !== generation) return
      setError('Could not copy your calendar link. Please try again.')
      return
    }
    if (copyGenerationRef.current !== generation) return
    setError(null)
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
