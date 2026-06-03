'use client'

import { usePathname } from 'next/navigation'
import { setDevRoleOverride, clearDevRoleOverride } from '@/app/actions/dev-role'
import type { Role } from '@/lib/db/types'

const ROLES: Role[] = ['manager', 'trainer', 'rider']

export function DevRoleSwitcher({ currentOverride }: { currentOverride: Role | null }) {
  const pathname = usePathname()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-xs shadow-lg dark:border-amber-500 dark:bg-amber-950">
      <span className="font-semibold text-amber-800 dark:text-amber-300">
        Dev: {currentOverride ?? 'admin'}
      </span>
      {ROLES.map((role) => (
        <button
          key={role}
          disabled={currentOverride === role}
          onClick={() => setDevRoleOverride(role, pathname)}
          className="rounded px-2 py-0.5 font-medium text-amber-900 hover:bg-amber-200 disabled:opacity-40 dark:text-amber-100 dark:hover:bg-amber-800"
        >
          {role}
        </button>
      ))}
      {currentOverride && (
        <button
          onClick={() => clearDevRoleOverride(pathname)}
          className="rounded px-2 py-0.5 font-medium text-amber-900 underline hover:bg-amber-200 dark:text-amber-100 dark:hover:bg-amber-800"
        >
          Reset
        </button>
      )}
    </div>
  )
}
