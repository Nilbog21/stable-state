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
const mockMembership = { id: 'mem-1', user_id: 'user-1', barn_id: 'barn-1', role: 'trainer' as const, status: 'active' as const, created_at: '' }

const mockSummary = [
  { id: 'horse-1', name: 'Thunderbolt', lessonCount: 3, totalExertion: 12, jumpingCount: 0 },
  { id: 'horse-2', name: 'Shadow', lessonCount: 1, totalExertion: 3, jumpingCount: 0 },
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
    vi.resetAllMocks()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    mockAuth()
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockMembership)
    vi.mocked(getHorseExertionSummary).mockResolvedValue(mockSummary)
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(
      HorseOverviewPage({ params: Promise.resolve({ slug: 'unknown' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_user_is_not_authenticated', async () => {
    mockAuth(null)
    await expect(
      HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_user_has_no_membership', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(null)
    await expect(
      HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_membership_is_not_active', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({ ...mockMembership, status: 'pending' })
    await expect(
      HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_render_thunderbolt', async () => {
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
  })

  it('should_render_shadow', async () => {
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Shadow')).toBeDefined()
  })

  it('should_render_thunderbolt_total_exertion', async () => {
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    // Default sort totalExertion desc; Thunderbolt (12) first — column order: Horse | Total Exertion | # Jumping | Lessons
    expect(screen.getAllByRole('cell')[1].textContent).toBe('12')
  })

  it('should_render_thunderbolt_lesson_count', async () => {
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByRole('cell')[3].textContent).toBe('3')
  })

  it('should_render_shadow_total_exertion', async () => {
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByRole('cell')[5].textContent).toBe('3')
  })

  it('should_render_shadow_lesson_count', async () => {
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByRole('cell')[7].textContent).toBe('1')
  })

  it('should_render_empty_state_when_no_horses', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([])
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/no horses/i)).toBeDefined()
  })

  it('should_render_higher_exertion_horse_first_by_default', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([
      { id: 'horse-2', name: 'Shadow', lessonCount: 1, totalExertion: 3, jumpingCount: 0 },
      { id: 'horse-1', name: 'Thunderbolt', lessonCount: 3, totalExertion: 12, jumpingCount: 0 },
    ])
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const names = screen.getAllByRole('cell').filter(c => c.textContent === 'Thunderbolt' || c.textContent === 'Shadow')
    expect(names[0].textContent).toBe('Thunderbolt')
  })

  it('should_render_lower_exertion_horse_second_by_default', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([
      { id: 'horse-2', name: 'Shadow', lessonCount: 1, totalExertion: 3, jumpingCount: 0 },
      { id: 'horse-1', name: 'Thunderbolt', lessonCount: 3, totalExertion: 12, jumpingCount: 0 },
    ])
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const names = screen.getAllByRole('cell').filter(c => c.textContent === 'Thunderbolt' || c.textContent === 'Shadow')
    expect(names[1].textContent).toBe('Shadow')
  })

  it('should_render_jumping_column_header', async () => {
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/# Jumping \(7d\)/i)).toBeDefined()
  })

  it('should_render_jumping_count_as_zero_when_no_jumping_lessons', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([
      { id: 'horse-1', name: 'Thunderbolt', lessonCount: 3, totalExertion: 12, jumpingCount: 0 },
    ])
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    // Column order: Horse | Total Exertion (7d) | # Jumping (7d) | Lessons (7d)
    expect(screen.getAllByRole('cell')[2].textContent).toBe('0')
  })

  it('should_render_jumping_count_when_horse_has_jumping_lessons', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([
      { id: 'horse-1', name: 'Thunderbolt', lessonCount: 3, totalExertion: 12, jumpingCount: 2 },
    ])
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByRole('cell')[2].textContent).toBe('2')
  })

  it('should_render_jumping_count_of_one_when_horse_has_one_jumping_lesson', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([
      { id: 'horse-1', name: 'Thunderbolt', lessonCount: 2, totalExertion: 8, jumpingCount: 1 },
    ])
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByRole('cell')[2].textContent).toBe('1')
  })

  it('should_render_horses_heading', async () => {
    const jsx = await HorseOverviewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /green acres — horses$/i })).toBeDefined()
  })
})
