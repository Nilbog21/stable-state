import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockHorseExertionSummary } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))
vi.mock('@/lib/db/horses', () => ({ getHorseExertionSummary: vi.fn() }))
vi.mock('../actions', () => ({
  addHorseAction: vi.fn(),
}))
vi.mock('../HorseCard', () => ({
  HorseCard: ({ horse, variant }: { horse: { name: string; id: string }; variant: string }) => (
    <a href={`#${horse.id}`} data-variant={variant}>{horse.name}</a>
  ),
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseExertionSummary } from '@/lib/db/horses'
import HorsesPage from '../page'

const mockBarn = createMockBarn()

const managerMembership = createMockMembership({ role: 'manager', status: 'active' })
const trainerMembership = createMockMembership({ role: 'trainer', status: 'active' })
const riderMembership = createMockMembership({ role: 'rider', status: 'active' })

const availableHorse = createMockHorseExertionSummary({ id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true })
const unavailableHorse = createMockHorseExertionSummary({ id: 'horse-2', name: 'Hobbled', is_active: true, is_available: false, unavailability_reason: 'Injury' })
const inactiveHorse = createMockHorseExertionSummary({ id: 'horse-3', name: 'Retired', is_active: false, is_available: false })

describe('HorsesPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getHorseExertionSummary).mockReset()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getHorseExertionSummary).mockResolvedValue([])
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'unknown' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_null', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_not_active', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...managerMembership, status: 'pending' })
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_render_available_section_heading_when_available_horses_exist', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([availableHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Available')).toBeDefined()
  })

  it('should_hide_available_section_when_no_available_horses', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([unavailableHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Available')).toBeNull()
  })

  it('should_render_unavailable_section_heading_when_unavailable_horses_exist', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([unavailableHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Unavailable')).toBeDefined()
  })

  it('should_hide_unavailable_section_when_no_unavailable_horses', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([availableHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Unavailable')).toBeNull()
  })

  it('should_render_inactive_section_heading_for_manager_when_inactive_horses_exist', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([inactiveHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Inactive')).toBeDefined()
  })

  it('should_hide_inactive_section_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getHorseExertionSummary).mockResolvedValue([inactiveHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Inactive')).toBeNull()
  })

  it('should_hide_inactive_section_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    vi.mocked(getHorseExertionSummary).mockResolvedValue([inactiveHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Inactive')).toBeNull()
  })

  it('should_hide_inactive_section_for_manager_when_no_inactive_horses', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([availableHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Inactive')).toBeNull()
  })

  it('should_render_add_horse_button_for_manager', async () => {
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('button', { name: /add/i })).toBeDefined()
  })

  it('should_not_render_add_horse_button_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull()
  })

  it('should_not_render_add_horse_button_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull()
  })

  it('should_render_available_horse_name', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([availableHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
  })

  it('should_render_unavailable_horse_name', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([unavailableHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Hobbled')).toBeDefined()
  })

  it('should_render_inactive_horse_name_for_manager', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([inactiveHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Retired')).toBeDefined()
  })
})
