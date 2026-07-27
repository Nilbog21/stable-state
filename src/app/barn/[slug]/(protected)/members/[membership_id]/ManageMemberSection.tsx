'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'

interface Props {
  barnSlug: string
  inviteToken: string
  revokeAction: () => Promise<void>
}

export function ManageMemberSection({ barnSlug, inviteToken, revokeAction }: Props) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Revoke regenerates the invite token server-side; Copy Invite must never read the
  // stale prop mid-flight. `pending` alone isn't enough (Next resolves the action's
  // own promise before it finishes applying the revalidated props), so both controls
  // also stay disabled while inviteToken still equals what it was pre-revoke. Revoke
  // itself must stay gated too, not just Copy Invite — otherwise a second Revoke click
  // in that same window re-pins tokenBeforeRevoke to the same stale value, and Copy
  // Invite re-enables the moment the *first* revoke's token lands even though a second
  // revoke is still in flight and about to supersede it.
  const [tokenBeforeRevoke, setTokenBeforeRevoke] = useState<string | null>(null)
  const [, formAction, pending] = useActionState(async () => {
    // Revoke supersedes whatever the last copy attempt was for, so a stale failure
    // shouldn't ride along into the new token's state. `error` has no auto-clear of
    // its own (unlike `copied`'s 2s timer), so it has to be cleared explicitly.
    setError(null)
    setTokenBeforeRevoke(inviteToken)
    await revokeAction()
    return null
  }, null)
  const awaitingFreshToken = tokenBeforeRevoke !== null && inviteToken === tokenBeforeRevoke
  const busy = pending || awaitingFreshToken

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // The invite URL is never rendered, so a failed write leaves nothing to fall back on and
  // has to say so: writeText needs a secure context, so it does fail when hitting the dev
  // server over LAN HTTP from a phone. Same reasoning as CalendarFeedSection (#1116).
  async function handleCopy() {
    const url = `${window.location.origin}/barn/${barnSlug}/register?token=${inviteToken}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      setError('Could not copy the invite link. Please try again.')
      return
    }
    setError(null)
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">
        Manage Member
      </h2>
      <p className="mb-3 text-sm text-amber-800 dark:text-amber-300">
        This is an unlinked member. Use the following controls to invite this person to the barn.
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" onClick={handleCopy} disabled={busy}>
          {copied ? 'Copied!' : 'Copy Invite'}
        </Button>
        <form action={formAction}>
          <Button type="submit" variant="danger" loading={busy}>
            Revoke
          </Button>
        </form>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}
