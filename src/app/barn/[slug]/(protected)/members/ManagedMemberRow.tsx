'use client'

import { revokeInviteTokenAction } from './actions'

interface Props {
  name: string
  barnSlug: string
  membershipId: string
  inviteToken: string
}

export function ManagedMemberRow({ name, barnSlug, membershipId, inviteToken }: Props) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-700">
      <span className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {name}
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          Unlinked
        </span>
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const url = `${window.location.origin}/barn/${barnSlug}/login?token=${inviteToken}`
            navigator.clipboard.writeText(url)
          }}
          className="flex min-h-[44px] items-center rounded border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Copy invite
        </button>
        <form
          action={revokeInviteTokenAction.bind(null, barnSlug, membershipId)}
        >
          <button
            type="submit"
            className="flex min-h-[44px] items-center rounded border border-red-300 px-3 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            Revoke
          </button>
        </form>
      </div>
    </div>
  )
}
