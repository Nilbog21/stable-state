import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/effective-membership', () => ({
  getEffectiveMembership: vi.fn(),
}))
vi.mock('@/lib/db/horses', () => ({ getHorseExertionSummary: vi.fn() }))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getHorseExertionSummary } from '@/lib/db/horses'
import { createClient } from '@/lib/supabase/server'
import HorseOverviewPage from '../page'

const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '' }
const mockMembership = { id: 'mem-1', user_id: 'user-1', barn_id: 'barn-1', role: 'trainer' as const, status: 'active' as const, created_at: '', default_fee: null }

const mockSummary = [
  { id: 'horse-1', name: 'Thunderbolt', lessonCount: 3, totalExertion: 12 },
  { id: 'horse-2', name: 'Shadow', lessonCount: 1, totalExertion: 3 },
]

function mockAuth(userId: string | null = 'user-1') {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
    },
  } as any)
}

describe('HorseOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    mockAuth()
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockMembership)
    vi.mocked(getHorseExertionSummary).mockResolvedValue(mockSummary)
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(
      HorseOverviewPage({ params: Promise.resolve({ slug: 'unknown' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_is_not_authenticated', async () => {
    mockAuth(null)
    await expect(
      HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_has_no_membership', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(null)
    await expect(
      HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_not_active', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({ ...mockMembership, status: 'pending' })
    await expect(
      HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_render_horse_names', async () => {
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    render(jsx)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
    expect(screen.getByText('Shadow')).toBeDefined()
  })

  it('should_render_lesson_count_and_total_exertion_per_horse', async () => {
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    render(jsx)
    // Default sort is desc; Thunderbolt (exertion=12) before Shadow (exertion=3)
    // Each row: [name, lessonCount, totalExertion]
    const cells = screen.getAllByRole('cell')
    expect(cells[1].textContent).toBe('3')   // Thunderbolt lessonCount
    expect(cells[2].textContent).toBe('12')  // Thunderbolt totalExertion
    expect(cells[4].textContent).toBe('1')   // Shadow lessonCount
    expect(cells[5].textContent).toBe('3')   // Shadow totalExertion
  })

  it('should_render_empty_state_when_no_horses', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([])
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    render(jsx)
    expect(screen.getByText(/no horses/i)).toBeDefined()
  })

  it('should_not_render_sort_links_when_no_horses', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([])
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    render(jsx)
    const sortLinks = screen.queryAllByRole('link').filter(
      (l) => (l as HTMLAnchorElement).href?.includes('sort=')
    )
    expect(sortLinks).toHaveLength(0)
  })

  it('should_sort_descending_by_total_exertion_by_default', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([
      { id: 'horse-2', name: 'Shadow', lessonCount: 1, totalExertion: 3 },
      { id: 'horse-1', name: 'Thunderbolt', lessonCount: 3, totalExertion: 12 },
    ])
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    render(jsx)
    const cells = screen.getAllByRole('cell')
    const names = cells.filter((c) => c.textContent === 'Thunderbolt' || c.textContent === 'Shadow')
    expect(names[0].textContent).toBe('Thunderbolt')
    expect(names[1].textContent).toBe('Shadow')
  })

  it('should_sort_ascending_by_total_exertion_when_sort_is_asc', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([
      { id: 'horse-2', name: 'Shadow', lessonCount: 1, totalExertion: 3 },
      { id: 'horse-1', name: 'Thunderbolt', lessonCount: 3, totalExertion: 12 },
    ])
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({ sort: 'asc' }) })
    render(jsx)
    const cells = screen.getAllByRole('cell')
    const names = cells.filter((c) => c.textContent === 'Thunderbolt' || c.textContent === 'Shadow')
    expect(names[0].textContent).toBe('Shadow')
    expect(names[1].textContent).toBe('Thunderbolt')
  })

  it('should_render_sort_links', async () => {
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    render(jsx)
    const links = screen.getAllByRole('link')
    const sortLinks = links.filter((l) => (l as HTMLAnchorElement).href?.includes('sort='))
    expect(sortLinks.length).toBeGreaterThanOrEqual(2)
  })
})
