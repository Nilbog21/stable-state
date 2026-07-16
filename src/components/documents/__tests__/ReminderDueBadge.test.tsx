import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ReminderDueBadge } from '../ReminderDueBadge'

afterEach(cleanup)

describe('ReminderDueBadge', () => {
  it('should_render_nothing_when_reminder_date_is_null', () => {
    render(<ReminderDueBadge reminderDate={null} today="2026-07-07" />)
    expect(screen.queryByText(/reminder due/i)).toBeNull()
  })

  it('should_render_nothing_when_reminder_date_is_in_the_future', () => {
    render(<ReminderDueBadge reminderDate="2026-08-01" today="2026-07-07" />)
    expect(screen.queryByText(/reminder due/i)).toBeNull()
  })

  it('should_render_badge_when_reminder_date_is_in_the_past', () => {
    render(<ReminderDueBadge reminderDate="2026-01-01" today="2026-07-07" />)
    expect(screen.getByText(/reminder due/i)).toBeDefined()
  })

  it('should_render_badge_without_wrapping_text', () => {
    render(<ReminderDueBadge reminderDate="2026-01-01" today="2026-07-07" />)
    expect(screen.getByText(/reminder due/i).className).toContain('whitespace-nowrap')
  })

  it('should_render_badge_when_reminder_date_is_today', () => {
    render(<ReminderDueBadge reminderDate="2026-07-07" today="2026-07-07" />)
    expect(screen.getByText(/reminder due/i)).toBeDefined()
  })

  it('should_render_badge_using_default_local_today_when_today_prop_omitted', () => {
    render(<ReminderDueBadge reminderDate="2020-01-01" />)
    expect(screen.getByText(/reminder due/i)).toBeDefined()
  })

  it('should_render_nothing_using_default_local_today_when_reminder_date_is_far_future', () => {
    render(<ReminderDueBadge reminderDate="2099-01-01" />)
    expect(screen.queryByText(/reminder due/i)).toBeNull()
  })
})
