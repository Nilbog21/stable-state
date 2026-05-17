import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/horses', () => ({
  getHorsesByBarn: vi.fn(),
}))

vi.mock('@/lib/db/riders', () => ({
  getRidersByBarn: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}))

vi.mock('@/app/actions/lessons', () => ({
  submitLesson: vi.fn(),
}))

import { getBarnBySlug } from '@/lib/db/barns'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getRidersByBarn } from '@/lib/db/riders'
import { notFound } from 'next/navigation'
import LessonNewPage from '../page'

const mockBarn = {
  id: 'barn-1',
  name: 'Green Acres',
  slug: 'green-acres',
  created_at: '2026-01-01T00:00:00Z',
}

const mockHorses = [
  { id: 'horse-1', barn_id: 'barn-1', name: 'Thunderbolt', created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 'horse-2', barn_id: 'barn-1', name: 'Shadow', created_at: '2026-01-02', updated_at: '2026-01-02' },
]

const mockRiders = [
  { id: 'rider-1', barn_id: 'barn-1', name: 'Alice', created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 'rider-2', barn_id: 'barn-1', name: 'Bob', created_at: '2026-01-02', updated_at: '2026-01-02' },
]

describe('LessonNewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getHorsesByBarn).mockResolvedValue(mockHorses)
    vi.mocked(getRidersByBarn).mockResolvedValue(mockRiders)
  })

  it('should_render_form_when_barn_exists', async () => {
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('button', { name: /submit/i })).toBeDefined()
  })

  it('should_call_notFound_when_barn_slug_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })

    await expect(
      LessonNewPage({ params: Promise.resolve({ slug: 'unknown-slug' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_render_horse_options_in_select', async () => {
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('option', { name: 'Thunderbolt' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'Shadow' })).toBeDefined()
  })

  it('should_render_rider_options_in_select', async () => {
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('option', { name: 'Alice' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'Bob' })).toBeDefined()
  })
})
