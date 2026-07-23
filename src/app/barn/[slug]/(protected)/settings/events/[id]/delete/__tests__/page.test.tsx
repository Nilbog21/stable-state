import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockBarnEvent } from '@/test/fixtures'

afterEach(cleanup)

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/barn-events', () => ({ getEventById: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))
vi.mock('../../../actions', () => ({ deleteEventAction: vi.fn() }))

import { requireMembership } from '@/lib/auth/guard'
import { getEventById } from '@/lib/db/barn-events'
import { notFound } from 'next/navigation'
import DeleteEventPage from '../page'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ role: 'manager', status: 'active' })
const mockEvent = createMockBarnEvent({ id: 'event-1', title: 'Costume Party' })

function setupDefaults() {
  vi.mocked(requireMembership).mockResolvedValue({
    user: { id: 'user-1' } as any,
    barn: mockBarn,
    membership: mockManagerMembership,
  })
  vi.mocked(getEventById).mockResolvedValue(mockEvent)
}

const params = Promise.resolve({ slug: 'green-acres', id: 'event-1' })

describe('DeleteEventPage', () => {
  beforeEach(() => {
    vi.mocked(notFound).mockReset()
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getEventById).mockReset()
    setupDefaults()
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await DeleteEventPage({ params })
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_notFound_when_event_not_found', async () => {
    vi.mocked(getEventById).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(DeleteEventPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_render_event_title_in_confirmation_copy', async () => {
    const jsx = await DeleteEventPage({ params })
    render(jsx)
    expect(screen.getByText(/Costume Party/)).toBeDefined()
  })

  it('should_render_confirm_delete_button', async () => {
    const jsx = await DeleteEventPage({ params })
    render(jsx)
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeDefined()
  })
})
