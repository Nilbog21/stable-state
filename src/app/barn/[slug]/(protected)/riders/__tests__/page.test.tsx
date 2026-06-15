import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockRider } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))
vi.mock('@/lib/db/riders', () => ({ getRidersByBarn: vi.fn() }))
vi.mock('../actions', () => ({
  updateRiderAction: vi.fn(),
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getRidersByBarn } from '@/lib/db/riders'
import RidersPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })

const mockRiders = [
  createMockRider({ id: 'rider-1', name: 'Jane Doe' }),
  createMockRider({ id: 'rider-2', name: 'John Smith' }),
]

describe('RidersPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getRidersByBarn).mockResolvedValue([])
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(RidersPage({ params: Promise.resolve({ slug: 'unknown' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    await expect(RidersPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_user_has_no_authorized_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    await expect(RidersPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_user_is_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ id: 'mem-rd', role: 'rider' }))
    await expect(RidersPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_render_rider_list_when_barn_exists', async () => {
    vi.mocked(getRidersByBarn).mockResolvedValue(mockRiders)
    const jsx = await RidersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/green acres/i)).toBeDefined()
  })

  it('should_render_each_rider_name_in_the_list', async () => {
    vi.mocked(getRidersByBarn).mockResolvedValue(mockRiders)
    const jsx = await RidersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByDisplayValue('Jane Doe')).toBeDefined()
    expect(screen.getByDisplayValue('John Smith')).toBeDefined()
  })

  it('should_render_edit_form_per_rider_with_current_name_prefilled', async () => {
    vi.mocked(getRidersByBarn).mockResolvedValue(mockRiders)
    const jsx = await RidersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByRole('button', { name: /save/i })).toHaveLength(2)
  })

  it('should_render_page_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ id: 'mem-tr', role: 'trainer' }))
    const jsx = await RidersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/green acres/i)).toBeDefined()
  })


  it('should_render_empty_state_when_no_riders', async () => {
    vi.mocked(getRidersByBarn).mockResolvedValue([])
    const jsx = await RidersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/no riders/i)).toBeDefined()
  })
})
