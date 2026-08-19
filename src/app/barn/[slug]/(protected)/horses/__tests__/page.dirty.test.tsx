import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockBarn, createMockMembership } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'
import { withBlocker } from '@/test/navigation-blocker-harness'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))
vi.mock('@/lib/db/horses', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/horses')>('@/lib/db/horses')
  return {
    ...actual,
    getHorseExertionSummary: vi.fn(),
    getHorseProjectedExhaustion: vi.fn(),
    getHorsesByBarn: vi.fn(),
    getOwnedHorses: vi.fn(),
  }
})
vi.mock('../actions', () => ({ addHorseAction: vi.fn() }))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseExertionSummary, getHorseProjectedExhaustion, getHorsesByBarn, getOwnedHorses } from '@/lib/db/horses'
import HorsesPage from '../page'

describe('HorsesPage — navigation dirty state', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn())
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'manager', status: 'active' }))
    vi.mocked(getHorseExertionSummary).mockResolvedValue([])
    vi.mocked(getHorseProjectedExhaustion).mockResolvedValue([])
    vi.mocked(getHorsesByBarn).mockResolvedValue([])
    vi.mocked(getOwnedHorses).mockResolvedValue([])
  })

  it('should_set_dirty_when_add_horse_name_typed', async () => {
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(withBlocker(jsx))
    fireEvent.change(screen.getByPlaceholderText('Horse name'), { target: { value: 'Clover' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
