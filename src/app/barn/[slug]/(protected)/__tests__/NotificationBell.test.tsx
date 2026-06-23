import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

afterEach(cleanup)

const mockRefresh = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, onClick, onNavigate, className }: {
    href: string
    children: React.ReactNode
    onClick?: () => void
    onNavigate?: (e: { preventDefault: () => void }) => void
    className?: string
  }) => (
    <a href={href} className={className} onClick={(e) => { onNavigate?.({ preventDefault: () => e.preventDefault() }); onClick?.() }}>{children}</a>
  ),
}))

vi.mock('@/app/actions/notifications', () => ({
  markAllNotificationsReadAction: vi.fn(),
}))

vi.mock('../NavigationBlocker', () => ({
  useNavigationBlocker: vi.fn(() => ({ dirty: false, setDirty: vi.fn(), pendingNav: null, setPendingNav: vi.fn() })),
}))

import { markAllNotificationsReadAction } from '@/app/actions/notifications'
import { useNavigationBlocker } from '../NavigationBlocker'
import { NotificationBell } from '../NotificationBell'
import type { Notification } from '@/lib/db/types'

const unreadNotif: Notification = {
  id: 'n-1',
  user_id: 'user-1',
  barn_id: 'barn-1',
  type: 'outstanding_payment',
  title: 'Payment overdue',
  body: 'You have an outstanding payment.',
  link: '/barn/test/finances',
  read_at: null,
  created_at: '2026-01-01T00:00:00Z',
}

const readNotif: Notification = {
  ...unreadNotif,
  id: 'n-2',
  title: 'Old notification',
  read_at: '2026-01-02T00:00:00Z',
}

const linkedNotif: Notification = {
  ...unreadNotif,
  id: 'n-3',
  link: '/barn/test/settings',
}

const unlinkNotif: Notification = {
  ...unreadNotif,
  id: 'n-4',
  link: null,
  title: 'No link notif',
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.mocked(markAllNotificationsReadAction).mockReset()
    mockRefresh.mockReset()
    vi.mocked(useNavigationBlocker).mockReturnValue({
      dirty: false,
      setDirty: vi.fn(),
      pendingNav: null,
      setPendingNav: vi.fn(),
    })
  })

  it('should_render_bell_button', () => {
    render(<NotificationBell notifications={[]} barnId="barn-1" />)

    expect(screen.getByRole('button', { name: /notifications/i })).toBeDefined()
  })

  it('should_show_unread_count_badge_when_unread_notifications_exist', () => {
    render(<NotificationBell notifications={[unreadNotif]} barnId="barn-1" />)

    expect(screen.getByText('1')).toBeDefined()
  })

  it('should_hide_badge_when_all_notifications_are_read', () => {
    render(<NotificationBell notifications={[readNotif]} barnId="barn-1" />)

    expect(screen.queryByText('1')).toBeNull()
  })

  it('should_hide_badge_when_no_notifications', () => {
    render(<NotificationBell notifications={[]} barnId="barn-1" />)

    expect(screen.queryByText(/^\d+$/)).toBeNull()
  })

  it('should_open_dropdown_on_click', () => {
    render(<NotificationBell notifications={[unreadNotif]} barnId="barn-1" />)

    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

    expect(screen.getByText('Payment overdue')).toBeDefined()
  })

  it('should_close_dropdown_on_outside_click', () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <NotificationBell notifications={[unreadNotif]} barnId="barn-1" />
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

    fireEvent.mouseDown(screen.getByTestId('outside'))

    expect(screen.queryByText('Payment overdue')).toBeNull()
  })

  it('should_render_notification_title_in_dropdown', () => {
    render(<NotificationBell notifications={[unreadNotif]} barnId="barn-1" />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

    expect(screen.getByText('Payment overdue')).toBeDefined()
  })

  it('should_render_notification_as_link_when_link_present', () => {
    render(<NotificationBell notifications={[linkedNotif]} barnId="barn-1" />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

    const link = screen.getByRole('link', { name: /payment overdue/i })
    expect((link as HTMLAnchorElement).href).toContain('/barn/test/settings')
  })

  it('should_not_render_link_for_notification_without_link_field', () => {
    render(<NotificationBell notifications={[unlinkNotif]} barnId="barn-1" />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

    expect(screen.queryByRole('link', { name: /no link notif/i })).toBeNull()
  })

  it('should_render_notification_title_as_plain_text_when_no_link', () => {
    render(<NotificationBell notifications={[unlinkNotif]} barnId="barn-1" />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

    expect(screen.getByText('No link notif')).toBeDefined()
  })

  it('should_render_no_notifications_message_when_list_is_empty', () => {
    render(<NotificationBell notifications={[]} barnId="barn-1" />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

    expect(screen.getByText(/no notifications/i)).toBeDefined()
  })

  it('should_call_mark_all_read_action_when_mark_all_read_clicked', async () => {
    vi.mocked(markAllNotificationsReadAction).mockResolvedValue({ error: null })
    render(<NotificationBell notifications={[unreadNotif]} barnId="barn-1" />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /mark all read/i }))
    })

    expect(markAllNotificationsReadAction).toHaveBeenCalledWith('barn-1')
  })

  it('should_refresh_after_successful_mark_all_read', async () => {
    vi.mocked(markAllNotificationsReadAction).mockResolvedValue({ error: null })
    render(<NotificationBell notifications={[unreadNotif]} barnId="barn-1" />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /mark all read/i }))
    })

    expect(mockRefresh).toHaveBeenCalled()
  })

  it('should_not_refresh_when_mark_all_read_action_returns_error', async () => {
    vi.mocked(markAllNotificationsReadAction).mockResolvedValue({ error: 'failed' })
    render(<NotificationBell notifications={[unreadNotif]} barnId="barn-1" />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /mark all read/i }))
    })

    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('should_render_read_notification_without_bold_style', () => {
    render(<NotificationBell notifications={[readNotif]} barnId="barn-1" />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

    const title = screen.getByText('Old notification')
    expect(title.className).not.toContain('font-semibold')
  })

  it('should_close_dropdown_when_linked_notification_is_clicked', () => {
    render(<NotificationBell notifications={[linkedNotif]} barnId="barn-1" />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

    fireEvent.click(screen.getByRole('link', { name: /payment overdue/i }))

    expect(screen.queryByText('Payment overdue')).toBeNull()
  })

  it('should_set_pending_nav_when_dirty_and_notification_link_clicked', () => {
    const mockSetPendingNav = vi.fn()
    vi.mocked(useNavigationBlocker).mockReturnValue({
      dirty: true,
      setDirty: vi.fn(),
      pendingNav: null,
      setPendingNav: mockSetPendingNav,
    })
    render(<NotificationBell notifications={[linkedNotif]} barnId="barn-1" />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

    fireEvent.click(screen.getByRole('link', { name: /payment overdue/i }))

    expect(mockSetPendingNav).toHaveBeenCalledWith({ type: 'push', href: '/barn/test/settings' })
  })
})
