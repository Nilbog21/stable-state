import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/calendar-feed', () => ({
  getCalendarFeedData: vi.fn(),
}))

import { getCalendarFeedData } from '@/lib/db/calendar-feed'
import { GET } from '../route'

describe('GET /calendar.ics', () => {
  beforeEach(() => { vi.mocked(getCalendarFeedData).mockReset() })

  it('should_return_400_when_token_missing', async () => {
    const request = new Request('http://localhost:3000/calendar.ics')
    const response = await GET(request as any)
    expect(response.status).toBe(400)
    expect(vi.mocked(getCalendarFeedData)).not.toHaveBeenCalled()
  })

  it('should_return_404_when_token_invalid', async () => {
    vi.mocked(getCalendarFeedData).mockResolvedValue({ valid: false, barnName: null, items: [] })
    const request = new Request('http://localhost:3000/calendar.ics?token=bad-tok')
    const response = await GET(request as any)
    expect(response.status).toBe(404)
  })

  it('should_return_200_with_ics_content_type_for_valid_token', async () => {
    vi.mocked(getCalendarFeedData).mockResolvedValue({
      valid: true,
      barnName: 'Sunny Acres',
      items: [
        { itemType: 'lesson', id: 'l-1', title: 'Custom', startsAt: '2026-08-01T14:00:00Z', durationMinutes: 60, notes: null },
      ],
    })
    const request = new Request('http://localhost:3000/calendar.ics?token=good-tok')
    const response = await GET(request as any)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8')
    const body = await response.text()
    expect(body).toContain('BEGIN:VEVENT')
    expect(body).toContain('SUMMARY:Custom')
  })

  it('should_pass_token_from_query_param_to_getCalendarFeedData', async () => {
    vi.mocked(getCalendarFeedData).mockResolvedValue({ valid: false, barnName: null, items: [] })
    const request = new Request('http://localhost:3000/calendar.ics?token=abc-123')
    await GET(request as any)
    expect(getCalendarFeedData).toHaveBeenCalledWith('abc-123')
  })
})
