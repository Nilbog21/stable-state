import { describe, it, expect, afterEach } from 'vitest'
import { monthAnchor, pastInstantInMonth, barnSlugFor, runPrefix } from './fixtures'

describe('monthAnchor', () => {
  it('should_land_on_day_15', () => {
    expect(monthAnchor(0, new Date(2026, 6, 27)).getDate()).toBe(15)
  })

  it('should_stay_in_the_current_month_for_zero', () => {
    expect(monthAnchor(0, new Date(2026, 6, 27)).getMonth()).toBe(6)
  })

  it('should_step_back_one_month_for_one', () => {
    expect(monthAnchor(1, new Date(2026, 6, 27)).getMonth()).toBe(5)
  })

  it('should_step_back_two_months_for_two', () => {
    expect(monthAnchor(2, new Date(2026, 6, 27)).getMonth()).toBe(4)
  })

  it('should_roll_the_year_back_when_stepping_past_january', () => {
    expect(monthAnchor(2, new Date(2026, 0, 10)).getFullYear()).toBe(2025)
  })

  it('should_wrap_to_november_when_stepping_two_months_back_from_january', () => {
    expect(monthAnchor(2, new Date(2026, 0, 10)).getMonth()).toBe(10)
  })
})

describe('pastInstantInMonth', () => {
  it('should_return_one_hour_ago_when_mid_month', () => {
    const now = new Date(2026, 6, 27, 14, 0, 0)
    expect(pastInstantInMonth(0, now).getTime()).toBe(now.getTime() - 60 * 60 * 1000)
  })

  it('should_clamp_to_start_of_month_within_the_first_hour_of_a_month', () => {
    const now = new Date(2026, 6, 1, 0, 20, 0)
    expect(pastInstantInMonth(0, now).getTime()).toBe(new Date(2026, 6, 1).getTime())
  })

  it('should_delegate_to_month_anchor_for_a_prior_month', () => {
    const now = new Date(2026, 6, 27, 14, 0, 0)
    expect(pastInstantInMonth(1, now).getTime()).toBe(monthAnchor(1, now).getTime())
  })
})

describe('barnSlugFor', () => {
  it('should_join_prefix_and_key_with_a_hyphen', () => {
    expect(barnSlugFor('e2e-123-456', 'dashboard')).toBe('e2e-123-456-dashboard')
  })
})

describe('runPrefix', () => {
  const original = process.env.E2E_RUN_PREFIX

  afterEach(() => {
    if (original === undefined) delete process.env.E2E_RUN_PREFIX
    else process.env.E2E_RUN_PREFIX = original
  })

  it('should_use_the_env_var_when_set', () => {
    process.env.E2E_RUN_PREFIX = 'e2e-999-1'
    expect(runPrefix()).toBe('e2e-999-1')
  })

  it('should_fall_back_to_an_e2e_prefixed_slug_when_unset', () => {
    delete process.env.E2E_RUN_PREFIX
    expect(runPrefix()).toMatch(/^e2e-/)
  })
})
