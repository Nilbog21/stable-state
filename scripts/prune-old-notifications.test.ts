import { describe, it, expect } from 'vitest'
import { formatPruneSummary } from './prune-old-notifications'

describe('formatPruneSummary', () => {
  it('should_use_singular_notification_when_count_is_one', () => {
    expect(formatPruneSummary(1)).toBe('Deleted 1 read notification older than 30 days.')
  })

  it('should_use_plural_notifications_when_count_is_greater_than_one', () => {
    expect(formatPruneSummary(3)).toBe('Deleted 3 read notifications older than 30 days.')
  })

  it('should_use_plural_notifications_when_count_is_zero', () => {
    expect(formatPruneSummary(0)).toBe('Deleted 0 read notifications older than 30 days.')
  })
})
