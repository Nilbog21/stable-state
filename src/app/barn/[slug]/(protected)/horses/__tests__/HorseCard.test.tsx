import { describe, it, expect } from 'vitest'
import { instant } from '@/test/fixtures'
import { render, screen } from '@testing-library/react'
import { HorseCard } from '../HorseCard'

const exhaustion = {
  existingRows: [{ lessonAt: instant('2026-07-01'), exertionLevel: 3 }],
  thresholds: { high: 11, moderate: 5 },
}

const availableHorse = {
  id: 'horse-1',
  name: 'Thunderbolt',
  registered_name: null,
  is_active: true,
  is_available: true,
  unavailability_reason: null,
  exhaustion_threshold_high: null,
  exhaustion_threshold_moderate: null,
  lessonCount: 3,
  totalExertion: 12,
  jumpingCount: 1,
}

const unavailableHorse = {
  id: 'horse-2',
  name: 'Hobbled',
  registered_name: null,
  is_active: true,
  is_available: false,
  unavailability_reason: 'Recovering from injury',
  exhaustion_threshold_high: null,
  exhaustion_threshold_moderate: null,
  lessonCount: 0,
  totalExertion: 0,
  jumpingCount: 0,
}

const unavailableNoReason = {
  id: 'horse-3',
  name: 'Resting',
  registered_name: null,
  is_active: true,
  is_available: false,
  unavailability_reason: null,
  exhaustion_threshold_high: null,
  exhaustion_threshold_moderate: null,
  lessonCount: 0,
  totalExertion: 0,
  jumpingCount: 0,
}

const inactiveHorse = {
  id: 'horse-4',
  name: 'Retired',
  registered_name: null,
  is_active: false,
  is_available: true,
  unavailability_reason: null,
  exhaustion_threshold_high: null,
  exhaustion_threshold_moderate: null,
  lessonCount: 0,
  totalExertion: 0,
  jumpingCount: 0,
}

const ownedActiveHorse = {
  id: 'horse-5',
  name: 'Clover',
  registered_name: null,
  is_active: true,
  is_available: true,
  unavailability_reason: null,
}

const ownedUnavailableHorse = {
  id: 'horse-6',
  name: 'Hobbled',
  registered_name: null,
  is_active: true,
  is_available: false,
  unavailability_reason: 'Injury',
}

const ownedInactiveHorse = {
  id: 'horse-7',
  name: 'Retired',
  registered_name: null,
  is_active: false,
  is_available: true,
  unavailability_reason: null,
}

describe('HorseCard', () => {
  describe('available variant', () => {
    it('should_render_horse_name', () => {
      render(<HorseCard horse={availableHorse} barnSlug="green-acres" variant="available" exhaustion={exhaustion} />)
      expect(screen.getByText('Thunderbolt')).toBeDefined()
    })

    it('should_render_as_link_to_horse_detail', () => {
      render(<HorseCard horse={availableHorse} barnSlug="green-acres" variant="available" exhaustion={exhaustion} />)
      expect(screen.getByRole('link').getAttribute('href')).toBe('/barn/green-acres/horses/horse-1')
    })

    it('should_render_exhaustion_bar_when_exhaustion_provided', () => {
      render(<HorseCard horse={availableHorse} barnSlug="green-acres" variant="available" exhaustion={exhaustion} />)
      expect(screen.getByRole('button', { name: /exhaustion/i })).toBeDefined()
    })

    it('should_not_render_exhaustion_bar_when_exhaustion_omitted', () => {
      render(<HorseCard horse={availableHorse} barnSlug="green-acres" variant="available" />)
      expect(screen.queryByRole('button', { name: /exhaustion/i })).toBeNull()
    })

    it('should_not_render_as_link_when_not_linkable', () => {
      render(<HorseCard horse={availableHorse} barnSlug="green-acres" variant="available" linkable={false} />)
      expect(screen.queryByRole('link')).toBeNull()
    })

    it('should_still_render_horse_name_when_not_linkable', () => {
      render(<HorseCard horse={availableHorse} barnSlug="green-acres" variant="available" linkable={false} />)
      expect(screen.getByText('Thunderbolt')).toBeDefined()
    })

    it('should_render_registered_name_in_parentheses_when_set', () => {
      render(<HorseCard horse={{ ...availableHorse, registered_name: 'Four-Leaf Clover' }} barnSlug="green-acres" variant="available" exhaustion={exhaustion} />)
      expect(screen.getByText('(Four-Leaf Clover)')).toBeDefined()
    })

    it('should_not_render_registered_name_when_unset', () => {
      render(<HorseCard horse={availableHorse} barnSlug="green-acres" variant="available" exhaustion={exhaustion} />)
      expect(screen.queryByText(/^\(.*\)$/)).toBeNull()
    })
  })

  describe('unavailable variant', () => {
    it('should_render_horse_name', () => {
      render(<HorseCard horse={unavailableHorse} barnSlug="green-acres" variant="unavailable" exhaustion={exhaustion} />)
      expect(screen.getByText('Hobbled')).toBeDefined()
    })

    it('should_render_as_link_to_horse_detail', () => {
      render(<HorseCard horse={unavailableHorse} barnSlug="green-acres" variant="unavailable" exhaustion={exhaustion} />)
      expect(screen.getByRole('link').getAttribute('href')).toBe('/barn/green-acres/horses/horse-2')
    })

    it('should_render_unavailability_reason', () => {
      render(<HorseCard horse={unavailableHorse} barnSlug="green-acres" variant="unavailable" exhaustion={exhaustion} />)
      expect(screen.getByText(/Recovering from injury/)).toBeDefined()
    })

    it('should_render_fallback_when_reason_is_null', () => {
      render(<HorseCard horse={unavailableNoReason} barnSlug="green-acres" variant="unavailable" exhaustion={exhaustion} />)
      expect(screen.getByText(/No reason given/)).toBeDefined()
    })

    it('should_render_exhaustion_bar_when_exhaustion_provided', () => {
      render(<HorseCard horse={unavailableHorse} barnSlug="green-acres" variant="unavailable" exhaustion={exhaustion} />)
      expect(screen.getByRole('button', { name: /exhaustion/i })).toBeDefined()
    })

    it('should_not_render_exertion_stats', () => {
      render(<HorseCard horse={unavailableHorse} barnSlug="green-acres" variant="unavailable" exhaustion={exhaustion} />)
      expect(screen.queryByText(/Exertion:/i)).toBeNull()
    })

    it('should_not_render_as_link_when_not_linkable', () => {
      render(<HorseCard horse={unavailableHorse} barnSlug="green-acres" variant="unavailable" linkable={false} />)
      expect(screen.queryByRole('link')).toBeNull()
    })

    it('should_still_render_unavailability_reason_when_not_linkable', () => {
      render(<HorseCard horse={unavailableHorse} barnSlug="green-acres" variant="unavailable" linkable={false} />)
      expect(screen.getByText(/Recovering from injury/)).toBeDefined()
    })
  })

  describe('inactive variant', () => {
    it('should_render_horse_name', () => {
      render(<HorseCard horse={inactiveHorse} barnSlug="green-acres" variant="inactive" />)
      expect(screen.getByText('Retired')).toBeDefined()
    })

    it('should_render_as_link_to_horse_detail', () => {
      render(<HorseCard horse={inactiveHorse} barnSlug="green-acres" variant="inactive" />)
      expect(screen.getByRole('link').getAttribute('href')).toBe('/barn/green-acres/horses/horse-4')
    })

    it('should_not_render_exhaustion_bar', () => {
      render(<HorseCard horse={inactiveHorse} barnSlug="green-acres" variant="inactive" />)
      expect(screen.queryByRole('button', { name: /exhaustion/i })).toBeNull()
    })

    it('should_not_render_unavailability_reason', () => {
      render(<HorseCard horse={inactiveHorse} barnSlug="green-acres" variant="inactive" />)
      expect(screen.queryByText(/No reason given/)).toBeNull()
    })

    it('should_render_registered_name_in_parentheses_when_set', () => {
      render(<HorseCard horse={{ ...inactiveHorse, registered_name: 'Old Timer' }} barnSlug="green-acres" variant="inactive" />)
      expect(screen.getByText('(Old Timer)')).toBeDefined()
    })
  })

  describe('owned variant', () => {
    it('should_render_horse_name', () => {
      render(<HorseCard horse={ownedActiveHorse} barnSlug="green-acres" variant="owned" />)
      expect(screen.getByText('Clover')).toBeDefined()
    })

    it('should_render_as_link_to_horse_detail', () => {
      render(<HorseCard horse={ownedActiveHorse} barnSlug="green-acres" variant="owned" />)
      expect(screen.getByRole('link').getAttribute('href')).toBe('/barn/green-acres/horses/horse-5')
    })

    it('should_render_registered_name_in_parentheses_when_set', () => {
      render(<HorseCard horse={{ ...ownedActiveHorse, registered_name: 'Four-Leaf Clover' }} barnSlug="green-acres" variant="owned" />)
      expect(screen.getByText('(Four-Leaf Clover)')).toBeDefined()
    })

    it('should_render_active_badge_when_active_and_available', () => {
      render(<HorseCard horse={ownedActiveHorse} barnSlug="green-acres" variant="owned" />)
      expect(screen.getByText('Active')).toBeDefined()
    })

    it('should_render_unavailable_badge_when_active_and_unavailable', () => {
      render(<HorseCard horse={ownedUnavailableHorse} barnSlug="green-acres" variant="owned" />)
      expect(screen.getByText('Unavailable')).toBeDefined()
    })

    it('should_render_inactive_badge_when_not_active_even_if_available', () => {
      render(<HorseCard horse={ownedInactiveHorse} barnSlug="green-acres" variant="owned" />)
      expect(screen.getByText('Inactive')).toBeDefined()
    })

    it('should_render_unavailability_reason_when_active_and_unavailable', () => {
      render(<HorseCard horse={ownedUnavailableHorse} barnSlug="green-acres" variant="owned" />)
      expect(screen.getByText(/Injury/)).toBeDefined()
    })

    it('should_render_fallback_when_active_and_unavailable_with_no_reason', () => {
      render(<HorseCard horse={{ ...ownedUnavailableHorse, unavailability_reason: null }} barnSlug="green-acres" variant="owned" />)
      expect(screen.getByText(/No reason given/)).toBeDefined()
    })

    it('should_not_render_unavailability_reason_when_inactive', () => {
      render(<HorseCard horse={{ ...ownedInactiveHorse, unavailability_reason: 'Injury' }} barnSlug="green-acres" variant="owned" />)
      expect(screen.queryByText(/Injury/)).toBeNull()
    })

    // #1391 inverted this: the owned variant used to swallow an exhaustion prop, which is why
    // page.tsx never fetched one for an owned horse (#1000). Both halves moved together.
    it('should_render_exhaustion_bar_when_exhaustion_provided', () => {
      render(<HorseCard horse={ownedActiveHorse} barnSlug="green-acres" variant="owned" exhaustion={exhaustion} />)
      expect(screen.getByRole('button', { name: /exhaustion/i })).toBeDefined()
    })

    it('should_not_render_exhaustion_bar_when_exhaustion_omitted', () => {
      render(<HorseCard horse={ownedActiveHorse} barnSlug="green-acres" variant="owned" />)
      expect(screen.queryByRole('button', { name: /exhaustion/i })).toBeNull()
    })

    it('should_not_render_as_link_when_not_linkable', () => {
      render(<HorseCard horse={ownedActiveHorse} barnSlug="green-acres" variant="owned" linkable={false} />)
      expect(screen.queryByRole('link')).toBeNull()
    })

    it('should_still_render_horse_name_when_not_linkable', () => {
      render(<HorseCard horse={ownedActiveHorse} barnSlug="green-acres" variant="owned" linkable={false} />)
      expect(screen.getByText('Clover')).toBeDefined()
    })
  })
})
