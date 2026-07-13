import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockHorseExertionSummary, createMockHorse } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))
vi.mock('@/lib/db/horses', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/horses')>('@/lib/db/horses')
  return {
    ...actual,
    getHorseExertionSummary: vi.fn(),
    getHorseProjectedExhaustion: vi.fn(),
    getHorsesByBarn: vi.fn(),
  }
})
vi.mock('../actions', () => ({
  addHorseAction: vi.fn(),
}))
vi.mock('../HorseCard', () => ({
  HorseCard: ({
    horse,
    variant,
    exhaustion,
  }: {
    horse: { name: string; id: string }
    variant: string
    exhaustion?: { existingRows: unknown[]; thresholds: { high: number; moderate: number } }
  }) => (
    <a
      href={`#${horse.id}`}
      data-variant={variant}
      data-thresholds={exhaustion ? JSON.stringify(exhaustion.thresholds) : undefined}
      data-row-count={exhaustion ? exhaustion.existingRows.length : undefined}
    >
      {horse.name}
    </a>
  ),
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseExertionSummary, getHorseProjectedExhaustion, getHorsesByBarn } from '@/lib/db/horses'
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
    vi.mocked(getHorseProjectedExhaustion).mockReset()
    vi.mocked(getHorsesByBarn).mockReset()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getHorseExertionSummary).mockResolvedValue([])
    vi.mocked(getHorseProjectedExhaustion).mockResolvedValue([])
    vi.mocked(getHorsesByBarn).mockResolvedValue([])
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'unknown' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_membership_is_null', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_membership_is_not_active', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...managerMembership, status: 'pending' })
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_NOT_FOUND')
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
    vi.mocked(getHorsesByBarn).mockResolvedValue([createMockHorse({ id: 'horse-3', name: 'Retired' })])
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

  it('should_render_lower_exertion_horse_before_higher_exertion_horse', async () => {
    const lowExertion = createMockHorseExertionSummary({ id: 'horse-a', name: 'Lazy', is_active: true, is_available: true, totalExertion: 2 })
    const highExertion = createMockHorseExertionSummary({ id: 'horse-b', name: 'Busy', is_active: true, is_available: true, totalExertion: 10 })
    vi.mocked(getHorseExertionSummary).mockResolvedValue([highExertion, lowExertion])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const links = screen.getAllByRole('link')
    expect(links[0].textContent).toBe('Lazy')
  })

  it('should_show_empty_state_when_no_horses', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('No horses yet')).toBeDefined()
  })

  it('should_show_manager_subtext_in_empty_state_for_manager', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Use the form above to add your first horse.')).toBeDefined()
  })

  it('should_show_default_subtext_in_empty_state_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getHorseExertionSummary).mockResolvedValue([])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('No horses have been added yet.')).toBeDefined()
  })

  it('should_not_show_empty_state_when_horses_exist', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([availableHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('No horses yet')).toBeNull()
  })

  it('should_use_barn_default_thresholds_when_horse_has_no_override', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([availableHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const link = screen.getByText('Thunderbolt')
    expect(JSON.parse(link.getAttribute('data-thresholds')!)).toEqual({ high: 11, moderate: 5 })
  })

  it('should_use_horse_override_thresholds_when_set', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([
      createMockHorseExertionSummary({ id: 'horse-1', name: 'Thunderbolt', exhaustion_threshold_high: 20, exhaustion_threshold_moderate: 8 }),
    ])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const link = screen.getByText('Thunderbolt')
    expect(JSON.parse(link.getAttribute('data-thresholds')!)).toEqual({ high: 20, moderate: 8 })
  })

  it('should_fetch_projected_exhaustion_for_each_active_horse', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([availableHorse, unavailableHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(getHorseProjectedExhaustion).toHaveBeenCalledTimes(2)
  })

  it('should_fetch_projected_exhaustion_scoped_to_the_current_barn', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([availableHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const [, barnId] = vi.mocked(getHorseProjectedExhaustion).mock.calls[0]
    expect(barnId).toBe(mockBarn.id)
  })

  it('should_fetch_projected_exhaustion_not_before_page_render_started', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([availableHorse])
    const before = Date.now()
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const [, , targetDate] = vi.mocked(getHorseProjectedExhaustion).mock.calls[0]
    expect((targetDate as Date).getTime()).toBeGreaterThanOrEqual(before)
  })

  it('should_fetch_projected_exhaustion_not_after_page_render_finished', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([availableHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    const after = Date.now()
    render(jsx)
    const [, , targetDate] = vi.mocked(getHorseProjectedExhaustion).mock.calls[0]
    expect((targetDate as Date).getTime()).toBeLessThanOrEqual(after)
  })

  it('should_not_fetch_projected_exhaustion_for_inactive_horses', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([inactiveHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(getHorseProjectedExhaustion).not.toHaveBeenCalled()
  })

  it('should_pass_projected_exhaustion_rows_to_horse_card', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([availableHorse])
    vi.mocked(getHorseProjectedExhaustion).mockResolvedValue([
      { lessonAt: '2026-07-01T00:00:00Z', exertionLevel: 3 },
      { lessonAt: '2026-07-02T00:00:00Z', exertionLevel: 4 },
    ])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const link = screen.getByText('Thunderbolt')
    expect(link.getAttribute('data-row-count')).toBe('2')
  })

  describe('rider role', () => {
    beforeEach(() => {
      vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    })

    it('should_not_call_getHorseExertionSummary_for_rider', async () => {
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(getHorseExertionSummary).not.toHaveBeenCalled()
    })

    it('should_not_call_getHorseProjectedExhaustion_for_rider', async () => {
      vi.mocked(getHorsesByBarn).mockResolvedValue([createMockHorse({ id: 'horse-1', name: 'Thunderbolt' })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(getHorseProjectedExhaustion).not.toHaveBeenCalled()
    })

    it('should_call_getHorsesByBarn_scoped_to_the_current_barn_for_rider', async () => {
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(getHorsesByBarn).toHaveBeenCalledWith(mockBarn.id)
    })

    it('should_render_available_section_heading_from_getHorsesByBarn_for_rider', async () => {
      vi.mocked(getHorsesByBarn).mockResolvedValue([createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: true })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getByText('Available')).toBeDefined()
    })

    it('should_render_available_horse_name_from_getHorsesByBarn_for_rider', async () => {
      vi.mocked(getHorsesByBarn).mockResolvedValue([createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: true })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getByText('Thunderbolt')).toBeDefined()
    })

    it('should_render_unavailable_section_heading_from_getHorsesByBarn_for_rider', async () => {
      vi.mocked(getHorsesByBarn).mockResolvedValue([
        createMockHorse({ id: 'horse-2', name: 'Hobbled', is_available: false, unavailability_reason: 'Injury' }),
      ])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getByText('Unavailable')).toBeDefined()
    })

    it('should_render_unavailable_horse_name_from_getHorsesByBarn_for_rider', async () => {
      vi.mocked(getHorsesByBarn).mockResolvedValue([
        createMockHorse({ id: 'horse-2', name: 'Hobbled', is_available: false, unavailability_reason: 'Injury' }),
      ])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getByText('Hobbled')).toBeDefined()
    })

    it('should_render_horse_card_with_no_exhaustion_thresholds_for_rider', async () => {
      vi.mocked(getHorsesByBarn).mockResolvedValue([createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: true })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      const link = screen.getByText('Thunderbolt')
      expect(link.getAttribute('data-thresholds')).toBeNull()
    })

    it('should_render_horse_card_with_no_exhaustion_row_count_for_rider', async () => {
      vi.mocked(getHorsesByBarn).mockResolvedValue([createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: true })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      const link = screen.getByText('Thunderbolt')
      expect(link.getAttribute('data-row-count')).toBeNull()
    })

    it('should_show_empty_state_when_rider_has_no_horses', async () => {
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getByText('No horses yet')).toBeDefined()
    })
  })
})
