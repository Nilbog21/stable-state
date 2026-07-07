import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HorseCard } from '../HorseCard'

const exhaustion = {
  existingRows: [{ lessonAt: '2026-07-01', exertionLevel: 3 }],
  thresholds: { high: 11, moderate: 5 },
}

const availableHorse = {
  id: 'horse-1',
  name: 'Thunderbolt',
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
  is_active: false,
  is_available: true,
  unavailability_reason: null,
  exhaustion_threshold_high: null,
  exhaustion_threshold_moderate: null,
  lessonCount: 0,
  totalExertion: 0,
  jumpingCount: 0,
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
  })
})
