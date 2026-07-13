'use client'

import Link from 'next/link'
import { revokeInviteTokenAction } from './actions'
import { Button } from '@/components/ui/Button'

interface Props {
  name: string
  barnSlug: string
  membershipId: string
  inviteToken: string
}

export function ManagedMemberRow({ name, barnSlug, membershipId, inviteToken }: Props) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-700">
      <Link
        href={`/barn/${barnSlug}/members/${membershipId}`}
        className="flex items-center gap-2 text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
      >
        {name}
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          Unlinked
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            const url = `${window.location.origin}/barn/${barnSlug}/login?token=${inviteToken}`
            navigator.clipboard.writeText(url)
          }}
        >
          Copy invite
        </Button>
        <form
          action={revokeInviteTokenAction.bind(null, barnSlug, membershipId)}
        >
          <Button type="submit" variant="danger">
            Revoke
          </Button>
        </form>
      </div>
    </div>
  )
}
