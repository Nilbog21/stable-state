import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockHorseExertionSummary, createMockHorse, instant } from '@/test/fixtures'
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
    getOwnedHorses: vi.fn(),
  }
})
vi.mock('@/lib/db/member-horse-privileges', () => ({
  getMyHorseLessonReadPrivilege: vi.fn(),
}))
vi.mock('../actions', () => ({
  addHorseAction: vi.fn(),
}))
vi.mock('../HorseCard', () => ({
  HorseCard: ({
    horse,
    variant,
    exhaustion,
    linkable,
  }: {
    horse: { name: string; id: string }
    variant: string
    exhaustion?: { existingRows: unknown[]; thresholds: { high: number; moderate: number } }
    linkable?: boolean
  }) => (
    <a
      href={`#${horse.id}`}
      data-variant={variant}
      data-thresholds={exhaustion ? JSON.stringify(exhaustion.thresholds) : undefined}
      data-row-count={exhaustion ? exhaustion.existingRows.length : undefined}
      data-linkable={String(linkable)}
    >
      {horse.name}
    </a>
  ),
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseExertionSummary, getHorseProjectedExhaustion, getHorsesByBarn, getOwnedHorses } from '@/lib/db/horses'
import { getMyHorseLessonReadPrivilege } from '@/lib/db/member-horse-privileges'
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
    vi.mocked(getOwnedHorses).mockReset()
    vi.mocked(getMyHorseLessonReadPrivilege).mockReset()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getHorseExertionSummary).mockResolvedValue([])
    vi.mocked(getHorseProjectedExhaustion).mockResolvedValue([])
    vi.mocked(getHorsesByBarn).mockResolvedValue([])
    vi.mocked(getOwnedHorses).mockResolvedValue([])
    // Defaults to true because that is the invariant the real UI maintains: set_horse_owner
    // elevates lesson_read_privileges as part of making a member the owner, and
    // revoke_horse_privilege clears owning_member_id when it deletes that row. The false case
    // is a manager toggling the grant off without clearing ownership, and it gets its own tests.
    vi.mocked(getMyHorseLessonReadPrivilege).mockResolvedValue(true)
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
    vi.mocked(getUserMembership).mockResolvedValue({ ...managerMembership, status: 'inactive' } as any)
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

  // #1553: the page does no sorting of its own — get_horse_exertion_summary already ends in
  // `ORDER BY h.name`, so Available/Unavailable/Inactive all render in the order the summary
  // hands them over. The mock's order is name order and disagrees with exertion order, so a
  // page that re-sorted by exertion (as it did before #1553) would put 'Busy' first and fail.
  it('should_render_available_horses_in_the_summarys_name_order', async () => {
    const highExertion = createMockHorseExertionSummary({ id: 'horse-a', name: 'Apple', is_active: true, is_available: true, totalExertion: 10 })
    const lowExertion = createMockHorseExertionSummary({ id: 'horse-b', name: 'Busy', is_active: true, is_available: true, totalExertion: 2 })
    vi.mocked(getHorseExertionSummary).mockResolvedValue([highExertion, lowExertion])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const links = screen.getAllByRole('link')
    expect(links[0].textContent).toBe('Apple')
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
      { lessonAt: instant('2026-07-01T00:00:00Z'), exertionLevel: 3 },
      { lessonAt: instant('2026-07-02T00:00:00Z'), exertionLevel: 4 },
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

    // Scoped to horses the rider doesn't own — getOwnedHorses defaults to [] here. The owned
    // case is the 'rider-owned horse' describe below, where the grant decides (#1391).
    it('should_not_call_getHorseProjectedExhaustion_for_unowned_horses_for_rider', async () => {
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

    it('should_render_available_horse_card_as_linkable_for_rider', async () => {
      vi.mocked(getHorsesByBarn).mockResolvedValue([createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: true })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getByText('Thunderbolt').getAttribute('data-linkable')).toBe('true')
    })

    it('should_render_unavailable_horse_card_as_linkable_for_rider', async () => {
      vi.mocked(getHorsesByBarn).mockResolvedValue([
        createMockHorse({ id: 'horse-2', name: 'Hobbled', is_available: false, unavailability_reason: 'Injury' }),
      ])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getByText('Hobbled').getAttribute('data-linkable')).toBe('true')
    })
  })

  it('should_render_available_horse_card_as_linkable_for_manager', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue([availableHorse])
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Thunderbolt').getAttribute('data-linkable')).toBe('true')
  })

  describe('My Horses section', () => {
    it('should_call_getOwnedHorses_scoped_to_barn_and_membership', async () => {
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(getOwnedHorses).toHaveBeenCalledWith(mockBarn.id, managerMembership.id)
    })

    it('should_call_getOwnedHorses_scoped_to_membership_for_rider', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(getOwnedHorses).toHaveBeenCalledWith(mockBarn.id, riderMembership.id)
    })

    it('should_render_my_horses_heading_when_owned_horses_exist', async () => {
      vi.mocked(getOwnedHorses).mockResolvedValue([createMockHorse({ id: 'horse-9', name: 'Clover' })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getByText('My Horses')).toBeDefined()
    })

    it('should_render_owned_horse_name', async () => {
      vi.mocked(getOwnedHorses).mockResolvedValue([createMockHorse({ id: 'horse-9', name: 'Clover' })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getByText('Clover')).toBeDefined()
    })

    it('should_render_owned_horse_card_with_owned_variant', async () => {
      vi.mocked(getOwnedHorses).mockResolvedValue([createMockHorse({ id: 'horse-9', name: 'Clover' })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getByText('Clover').getAttribute('data-variant')).toBe('owned')
    })

    it('should_not_render_my_horses_heading_when_no_owned_horses', async () => {
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.queryByText('My Horses')).toBeNull()
    })

    it('should_exclude_owned_horse_from_available_section', async () => {
      vi.mocked(getHorseExertionSummary).mockResolvedValue([availableHorse])
      vi.mocked(getOwnedHorses).mockResolvedValue([createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getAllByText('Thunderbolt')).toHaveLength(1)
    })

    // #1391 inverted this: #1000 skipped the fan-out for owned horses because the owned card had
    // no bar to feed. It has one now, so the horse is excluded from Available/Unavailable (the
    // test above) and still fetched — exactly once, as the owned card's subject.
    it('should_fetch_projected_exhaustion_for_owned_horse', async () => {
      vi.mocked(getHorseExertionSummary).mockResolvedValue([availableHorse])
      vi.mocked(getOwnedHorses).mockResolvedValue([createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(getHorseProjectedExhaustion).toHaveBeenCalledTimes(1)
    })

    it('should_pass_exhaustion_thresholds_to_the_owned_horse_card_for_manager', async () => {
      vi.mocked(getOwnedHorses).mockResolvedValue([
        createMockHorse({ id: 'horse-9', name: 'Clover', exhaustion_threshold_high: 20, exhaustion_threshold_moderate: 8 }),
      ])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(JSON.parse(screen.getByText('Clover').getAttribute('data-thresholds')!)).toEqual({ high: 20, moderate: 8 })
    })

    it('should_pass_exhaustion_thresholds_to_the_owned_horse_card_for_trainer', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
      vi.mocked(getOwnedHorses).mockResolvedValue([createMockHorse({ id: 'horse-9', name: 'Clover' })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(JSON.parse(screen.getByText('Clover').getAttribute('data-thresholds')!)).toEqual({ high: 11, moderate: 5 })
    })

    it('should_pass_projected_exhaustion_rows_to_the_owned_horse_card', async () => {
      vi.mocked(getOwnedHorses).mockResolvedValue([createMockHorse({ id: 'horse-9', name: 'Clover' })])
      vi.mocked(getHorseProjectedExhaustion).mockResolvedValue([
        { lessonAt: instant('2026-07-01T00:00:00Z'), exertionLevel: 3 },
      ])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getByText('Clover').getAttribute('data-row-count')).toBe('1')
    })

    // The rider half. get_horse_projected_exhaustion admits a rider only through
    // auth_has_horse_lesson_read_privilege and raises for one holding no grant, so the page
    // checks the grant rather than inferring it from ownership.
    describe('rider-owned horse', () => {
      beforeEach(() => {
        vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
        vi.mocked(getOwnedHorses).mockResolvedValue([createMockHorse({ id: 'horse-9', name: 'Clover' })])
      })

      it('should_check_the_lesson_read_grant_scoped_to_the_horse_and_barn', async () => {
        const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
        render(jsx)
        expect(getMyHorseLessonReadPrivilege).toHaveBeenCalledWith('horse-9', mockBarn.id)
      })

      it('should_pass_exhaustion_thresholds_to_the_owned_card_when_the_rider_holds_the_grant', async () => {
        const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
        render(jsx)
        expect(JSON.parse(screen.getByText('Clover').getAttribute('data-thresholds')!)).toEqual({ high: 11, moderate: 5 })
      })

      it('should_pass_projected_exhaustion_rows_to_the_owned_card_when_the_rider_holds_the_grant', async () => {
        vi.mocked(getHorseProjectedExhaustion).mockResolvedValue([
          { lessonAt: instant('2026-07-01T00:00:00Z'), exertionLevel: 3 },
        ])
        const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
        render(jsx)
        expect(screen.getByText('Clover').getAttribute('data-row-count')).toBe('1')
      })

      it('should_pass_no_exhaustion_to_the_owned_card_when_the_rider_holds_no_grant', async () => {
        vi.mocked(getMyHorseLessonReadPrivilege).mockResolvedValue(false)
        const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
        render(jsx)
        expect(screen.getByText('Clover').getAttribute('data-thresholds')).toBeNull()
      })

      it('should_not_call_getHorseProjectedExhaustion_when_the_rider_holds_no_grant', async () => {
        vi.mocked(getMyHorseLessonReadPrivilege).mockResolvedValue(false)
        const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
        render(jsx)
        expect(getHorseProjectedExhaustion).not.toHaveBeenCalled()
      })

      it('should_not_check_the_lesson_read_grant_for_a_horse_the_rider_does_not_own', async () => {
        vi.mocked(getHorsesByBarn).mockResolvedValue([createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: true })])
        const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
        render(jsx)
        expect(getMyHorseLessonReadPrivilege).not.toHaveBeenCalledWith('horse-1', mockBarn.id)
      })
    })

    it('should_exclude_owned_horse_from_unavailable_section', async () => {
      vi.mocked(getHorseExertionSummary).mockResolvedValue([unavailableHorse])
      vi.mocked(getOwnedHorses).mockResolvedValue([createMockHorse({ id: 'horse-2', name: 'Hobbled', is_active: true, is_available: false })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getAllByText('Hobbled')).toHaveLength(1)
    })

    it('should_exclude_owned_horse_from_inactive_section_for_manager', async () => {
      vi.mocked(getHorseExertionSummary).mockResolvedValue([inactiveHorse])
      vi.mocked(getOwnedHorses).mockResolvedValue([createMockHorse({ id: 'horse-3', name: 'Retired', is_active: false })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getAllByText('Retired')).toHaveLength(1)
    })

    it('should_exclude_owned_horse_from_rider_sections', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
      vi.mocked(getHorsesByBarn).mockResolvedValue([createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: true })])
      vi.mocked(getOwnedHorses).mockResolvedValue([createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: true })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getAllByText('Thunderbolt')).toHaveLength(1)
    })

    it('should_suppress_empty_state_when_only_owned_horses_exist', async () => {
      vi.mocked(getOwnedHorses).mockResolvedValue([createMockHorse({ id: 'horse-9', name: 'Clover' })])
      const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.queryByText('No horses yet')).toBeNull()
    })
  })
})
