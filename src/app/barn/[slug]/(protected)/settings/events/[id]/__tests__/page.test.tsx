import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockBarnEvent } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))
vi.mock('@/lib/db/barn-events', () => ({ getEventById: vi.fn() }))
vi.mock('../../../actions', () => ({
  updateEventAction: vi.fn(),
}))
vi.mock('../../EventForm', () => ({
  EventForm: ({ mode, initialEvent }: { mode: string; initialEvent?: { title: string } }) => (
    <div data-testid="event-form" data-mode={mode} data-event-title={initialEvent?.title}>
      EventForm
    </div>
  ),
}))

const mockNotFound = vi.hoisted(() =>
  vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
)
const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url}`,
    })
  })
)
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getEventById } from '@/lib/db/barn-events'
import EventEditPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ role: 'manager', status: 'active' })
const mockEvent = createMockBarnEvent({ id: 'event-1', title: 'Costume Party' })

describe('EventEditPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getEventById).mockReset()
    mockNotFound.mockClear()
    mockRedirect.mockClear()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getEventById).mockResolvedValue(mockEvent)
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(
      EventEditPage({ params: Promise.resolve({ slug: 'unknown', id: 'event-1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_redirect_when_user_is_not_authenticated', async () => {
    setupAuth(null)

    await expect(
      EventEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'event-1' }) })
    ).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_when_user_is_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(
      createMockMembership({ role: 'rider', status: 'active' })
    )

    await expect(
      EventEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'event-1' }) })
    ).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_call_notFound_when_event_does_not_exist', async () => {
    vi.mocked(getEventById).mockResolvedValue(null)

    await expect(
      EventEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'unknown' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_render_event_form_in_edit_mode', async () => {
    const jsx = await EventEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'event-1' }) })
    render(jsx)

    const form = screen.getByTestId('event-form')
    expect(form.getAttribute('data-mode')).toBe('edit')
  })

  it('should_pass_event_data_to_form', async () => {
    const jsx = await EventEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'event-1' }) })
    render(jsx)

    const form = screen.getByTestId('event-form')
    expect(form.getAttribute('data-event-title')).toBe('Costume Party')
  })

  it('should_render_edit_event_heading', async () => {
    const jsx = await EventEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'event-1' }) })
    render(jsx)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Edit Event')
  })
})
