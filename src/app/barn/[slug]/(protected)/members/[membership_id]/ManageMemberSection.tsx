'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'

interface Props {
  barnSlug: string
  inviteToken: string
  // Must be the bound Server Function itself, not a closure wrapping it (#1385/#1396): React only
  // emits the pre-hydration `method="POST"` form markup for the former, so a closure here would
  // make Revoke a silent no-op for any click landing before hydration.
  revokeAction: (
    prevState: { error: string | null } | null,
    formData: FormData
  ) => Promise<{ error: string | null }>
}

export function ManageMemberSection({ barnSlug, inviteToken, revokeAction }: Props) {
  // What the last settled copy attempt produced, tagged with the token it was for. handleCopy
  // records it unconditionally and decides nothing: whether it is still current is derived below,
  // because the thing that invalidates it — a Revoke — resolves as a state update, so any answer
  // latched in the clipboard continuation is one React commit out of date (#1396).
  const [copyOutcome, setCopyOutcome] = useState<{ token: string; error: string | null } | null>(null)
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
  // `revokeAction` goes to the hook unwrapped, so the pre-submit setup below lives in the form's
  // onSubmit and the error path is derived from the returned state (#1396).
  const [state, formAction, pending] = useActionState(revokeAction, null)

  // Nothing was rotated, so the fresh-token gate has no fresh token coming — without the
  // `!state.error` term it would leave both buttons disabled until a reload. Same rollback
  // CalendarFeedSection.handleRegenerate performs when regenerateAction rejects.
  const awaitingFreshToken =
    tokenBeforeRevoke !== null && inviteToken === tokenBeforeRevoke && !state?.error
  const busy = pending || awaitingFreshToken

  // Nothing disables either button while writeText is awaiting — `busy` only goes true once
  // Revoke is submitted — so a copy can still be in flight when Revoke supersedes its token. A
  // settled copy counts only while the token it was for is still the live one and no revoke is in
  // flight or awaiting its replacement. Both terms are read here rather than in the continuation,
  // so a failed revoke re-admits the copy the instant its error lands: the token was never
  // rotated, and `busy` goes false in the same render that shows the error.
  const currentCopy = copyOutcome !== null && copyOutcome.token === inviteToken && !busy ? copyOutcome : null
  // Suppressed for its own retry's pending window — what setError(null) at the top of the old
  // wrapped action did.
  const revokeError = pending ? null : state?.error ?? null
  // One error slot, two sources, and a current settled copy owns it outright — including when that
  // copy succeeded, which is why this can't be `currentCopy?.error ?? revokeError`: a successful
  // copy's error is `null`, and `??` would fall through to the revoke error and render it beside a
  // button reading "Copied!". Ownership rather than dismissal, because the two can genuinely
  // overlap: a revoke that fails while the clipboard write is in flight lands after handleCopy has
  // run and before its continuation, so nothing the handler latches can know about it. The revoke
  // error is therefore hidden for exactly as long as "Copied!" is on screen and returns when the 2s
  // timer clears the outcome — the revoke did fail, and the token was never rotated.
  const shownError = currentCopy !== null ? currentCopy.error : revokeError

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // The invite URL is never rendered, so a failed write leaves nothing to fall back on and
  // has to say so: writeText needs a secure context, so it does fail when hitting the dev
  // server over LAN HTTP from a phone. Same reasoning as CalendarFeedSection (#1116).
  async function handleCopy() {
    const token = inviteToken
    const url = `${window.location.origin}/barn/${barnSlug}/register?token=${token}`
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      setCopyOutcome({ token, error: 'Could not copy the invite link. Please try again.' })
      return
    }
    setCopyOutcome({ token, error: null })
    timerRef.current = setTimeout(() => setCopyOutcome(null), 2000)
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
          {currentCopy?.error === null ? 'Copied!' : 'Copy Invite'}
        </Button>
        <form
          action={formAction}
          onSubmit={() => {
            // Revoke supersedes whatever the last copy attempt was for, so neither a stale
            // failure nor a stale "Copied!" should ride along into the new token's state. The
            // outcome does self-clear on its 2s timer, but until it fires the disabled button
            // reads "Copied!" about a token being revoked. Same pair CalendarFeedSection's
            // handleRegenerate clears.
            setCopyOutcome(null)
            setTokenBeforeRevoke(inviteToken)
          }}
        >
          <Button type="submit" variant="danger" loading={busy}>
            Revoke
          </Button>
        </form>
      </div>
      {shownError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{shownError}</p>}
    </section>
  )
}
