'use client'
import { useOutsideDismiss } from '@/components/useOutsideDismiss'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { markAllNotificationsReadAction } from '@/app/actions/notifications'
import { useNavigationBlocker } from './NavigationBlocker'
import type { Notification } from '@/lib/db/types'
import { formatBarnDate } from '@/lib/format-date'

interface Props {
  notifications: Notification[]
  barnSlug: string
}

export function NotificationBell({ notifications, barnSlug }: Props) {
  const { open, setOpen, ref } = useOutsideDismiss()
  const router = useRouter()
  const { dirty, setPendingNav } = useNavigationBlocker()
  const unreadCount = notifications.filter((n) => !n.read_at).length

  async function handleMarkAllRead() {
    const result = await markAllNotificationsReadAction(barnSlug)
    if (result.error) return
    router.refresh()
  }

  return (
    <div ref={ref} className="relative">
      {/* Raw Tailwind, not <Button>: icon-only circular nav control — none of
          Button's variants target an unpadded round icon button, and this is
          the only call site, so it's not worth adding one for. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-10 w-80 rounded-lg border border-zinc-200 bg-white shadow-md dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2 dark:border-zinc-800">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Notifications</span>
            {/* Raw Tailwind, not <Button>: bare text-link control, no
                background/border/padding — none of Button's variants fit a
                plain inline text action, and this is the only call site. */}
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto py-1">
            {notifications.length === 0 ? (
              <li className="px-4 py-3 text-sm text-zinc-500">No notifications</li>
            ) : (
              notifications.map((n) => {
                const isUnread = !n.read_at
                const inner = (
                  <div>
                    <p className={`text-sm ${isUnread ? 'font-semibold text-zinc-900 dark:text-zinc-50' : 'text-zinc-700 dark:text-zinc-300'}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">{n.body}</p>
                    )}
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {formatBarnDate(n.created_at)}
                    </p>
                  </div>
                )
                return (
                  <li key={n.id} className={`px-4 py-2 ${isUnread ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}>
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => setOpen(false)}
                        onNavigate={(e) => {
                          if (dirty) {
                            e.preventDefault()
                            setPendingNav({ type: 'push', href: n.link! })
                          }
                        }}
                        className="block hover:opacity-80"
                      >
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
