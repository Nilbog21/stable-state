import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { existsSync } from 'fs'
import { isAbsolute } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createLessonWithParticipants } from '@/lib/db/lesson-participants'
import { instantToLocalWallClock } from '@/lib/barn-timezone'
import {
  monthAnchor,
  pastInstantInMonth,
  barnSlugFor,
  runPrefix,
  assetPath,
  daysFromNow,
  addUnpaidLesson,
  type SeededBarn,
} from './fixtures'

vi.mock('@/lib/db/lesson-participants', () => ({ createLessonWithParticipants: vi.fn() }))

// Both `now` inputs and assertions are UTC-framed throughout, matching what the helpers
// promise (see their docs) — a local `new Date(2026, 6, 27)` here would make every case below
// mean something different depending on the runner's zone, which is the very bug under test.
describe('monthAnchor', () => {
  it('should_land_on_day_15', () => {
    expect(monthAnchor(0, new Date(Date.UTC(2026, 6, 27))).getUTCDate()).toBe(15)
  })

  it('should_stay_in_the_current_month_for_zero', () => {
    expect(monthAnchor(0, new Date(Date.UTC(2026, 6, 27))).getUTCMonth()).toBe(6)
  })

  it('should_step_back_one_month_for_one', () => {
    expect(monthAnchor(1, new Date(Date.UTC(2026, 6, 27))).getUTCMonth()).toBe(5)
  })

  it('should_step_back_two_months_for_two', () => {
    expect(monthAnchor(2, new Date(Date.UTC(2026, 6, 27))).getUTCMonth()).toBe(4)
  })

  it('should_roll_the_year_back_when_stepping_past_january', () => {
    expect(monthAnchor(2, new Date(Date.UTC(2026, 0, 10))).getUTCFullYear()).toBe(2025)
  })

  it('should_wrap_to_november_when_stepping_two_months_back_from_january', () => {
    expect(monthAnchor(2, new Date(Date.UTC(2026, 0, 10))).getUTCMonth()).toBe(10)
  })
})

describe('pastInstantInMonth', () => {
  it('should_return_one_hour_ago_when_mid_month', () => {
    const now = new Date(Date.UTC(2026, 6, 27, 14, 0, 0))
    expect(pastInstantInMonth(0, now).getTime()).toBe(now.getTime() - 60 * 60 * 1000)
  })

  it('should_clamp_to_start_of_month_within_the_first_hour_of_a_month', () => {
    const now = new Date(Date.UTC(2026, 6, 1, 0, 20, 0))
    expect(pastInstantInMonth(0, now).getTime()).toBe(Date.UTC(2026, 6, 1))
  })

  it('should_delegate_to_month_anchor_for_a_prior_month', () => {
    const now = new Date(Date.UTC(2026, 6, 27, 14, 0, 0))
    expect(pastInstantInMonth(1, now).getTime()).toBe(monthAnchor(1, now).getTime())
  })
})

/**
 * #1221: `goToDaysAhead` navigates the dashboard barn-relative, so the seed has to be placed
 * barn-relative too. Every case here uses a `now` whose barn-local day differs from its UTC
 * day (23:30 barn-local), which is exactly the skew a runner-relative offset used to smuggle in.
 */
describe('daysFromNow', () => {
  const TZ = 'America/New_York'
  // 03:30Z is 23:30 the *previous* day in the barn's zone, so a UTC-framed offset would land
  // a day later than the dashboard's own "+2 days" does.
  const now = new Date('2026-07-21T03:30:00Z')

  it('should_land_on_the_barn_local_calendar_day_n_days_out', () => {
    expect(instantToLocalWallClock(daysFromNow(2, TZ, now), TZ).slice(0, 10)).toBe('2026-07-22')
  })

  it('should_place_the_instant_at_barn_local_noon', () => {
    expect(instantToLocalWallClock(daysFromNow(2, TZ, now), TZ).slice(11)).toBe('12:00:00')
  })

  it('should_step_backwards_for_a_negative_offset', () => {
    expect(instantToLocalWallClock(daysFromNow(-1, TZ, now), TZ).slice(0, 10)).toBe('2026-07-19')
  })

  // Spring forward is 2026-03-08 in this zone: the two days either side of it are 23 hours
  // apart, so any implementation adding 24h × days drifts to 11:00 instead of noon.
  it('should_stay_at_barn_local_noon_across_a_dst_transition', () => {
    const beforeTransition = new Date('2026-03-07T17:00:00Z')
    expect(instantToLocalWallClock(daysFromNow(2, TZ, beforeTransition), TZ)).toBe('2026-03-09T12:00:00')
  })

  // The whole point of the barn-timezone argument: the answer must not move when the runner's
  // own zone does. Same save/restore shape as the UTC-month-framing block below.
  describe('runner zone independence', () => {
    const originalTZ = process.env.TZ

    afterEach(() => {
      if (originalTZ === undefined) delete process.env.TZ
      else process.env.TZ = originalTZ
    })

    it('should_ignore_the_runner_zone', () => {
      process.env.TZ = 'Pacific/Kiritimati'
      expect(daysFromNow(2, TZ, now).toISOString()).toBe('2026-07-22T16:00:00.000Z')
    })
  })
})

describe('addUnpaidLesson', () => {
  // A barn in a zone the runner is unlikely to share, and instants built from explicit UTC ISO
  // strings, so both assertions hold whatever TZ the suite runs under.
  const barn: SeededBarn = { id: 'barn-1', slug: 'e2e-barn', name: 'E2E Barn', timezone: 'America/New_York' }
  const supabase = {} as SupabaseClient
  const opts = { instructorId: null, horseIds: [], riderIds: [], fee: 80 }

  const lessonAtOfLastCall = () => vi.mocked(createLessonWithParticipants).mock.calls[0][0].lessonAt

  beforeEach(() => {
    vi.mocked(createLessonWithParticipants).mockReset()
  })

  // The #1150 case: 03:30Z is 23:30 in the barn's zone, so day+2 lands at barn-local 23:30 —
  // after that day's 23:00 expense, inverting the interleave assertion. Barn-local is the frame
  // that matters here: mergeScheduleItems sorts on the wall clock, not on the instant.
  it('should_place_the_lesson_at_the_given_barn_local_time', async () => {
    await addUnpaidLesson(supabase, barn, { ...opts, at: daysFromNow(2, barn.timezone, new Date('2026-07-21T03:30:00Z')), time: '10:00' })
    expect(lessonAtOfLastCall()).toBe('2026-07-22T14:00:00.000Z')
  })

  it('should_keep_the_seed_instant_when_no_time_is_given', async () => {
    const at = new Date('2026-07-22T23:30:00Z')
    await addUnpaidLesson(supabase, barn, { ...opts, at })
    expect(lessonAtOfLastCall()).toBe(at.toISOString())
  })
})

/**
 * #1151: the app buckets Finances by UTC month (resolveFinancesMonth, formatMonthParam), so
 * these anchors have to as well — a local-calendar anchor lands in a different bucket than the
 * `?month=` a spec navigates to for the |UTC offset| hours either side of a month boundary.
 *
 * The runner's own zone is whatever the developer's machine says, so each case pins TZ rather
 * than depending on it: `Pacific/Niue` (UTC−11) is still in the previous month at 00:30 UTC on
 * the 1st, and `Pacific/Kiritimati` (UTC+14) is already in the next one at 23:30 UTC on the
 * last day. Mutating process.env.TZ mid-process does repoint Date's local getters on Node —
 * the same save/restore shape the runPrefix block below uses for its own env var.
 */
describe('UTC month framing across a zone-skewed month boundary', () => {
  const originalTZ = process.env.TZ

  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ
    else process.env.TZ = originalTZ
  })

  it('should_anchor_in_the_utc_month_when_the_runner_is_behind_utc', () => {
    process.env.TZ = 'Pacific/Niue'
    expect(monthAnchor(0, new Date(Date.UTC(2026, 6, 1, 0, 30))).getUTCMonth()).toBe(6)
  })

  it('should_anchor_in_the_utc_month_when_the_runner_is_ahead_of_utc', () => {
    process.env.TZ = 'Pacific/Kiritimati'
    expect(monthAnchor(0, new Date(Date.UTC(2026, 6, 31, 23, 30))).getUTCMonth()).toBe(6)
  })

  it('should_clamp_to_the_utc_month_start_when_the_runner_is_behind_utc', () => {
    process.env.TZ = 'Pacific/Niue'
    expect(pastInstantInMonth(0, new Date(Date.UTC(2026, 6, 1, 0, 30))).getTime()).toBe(Date.UTC(2026, 6, 1))
  })

  it('should_clamp_to_the_utc_month_start_when_the_runner_is_ahead_of_utc', () => {
    process.env.TZ = 'Pacific/Kiritimati'
    expect(pastInstantInMonth(0, new Date(Date.UTC(2026, 7, 1, 0, 30))).getTime()).toBe(Date.UTC(2026, 7, 1))
  })
})

describe('barnSlugFor', () => {
  it('should_join_prefix_key_and_project_with_hyphens', () => {
    expect(barnSlugFor('e2e-123-456', 'dashboard', 'manager')).toBe('e2e-123-456-dashboard-manager')
  })

  // Playwright dispatches one job per (spec file × project), so a slug keyed only on the file
  // collides whenever two projects grep the same spec — see e2e/support/test.ts.
  it('should_produce_distinct_slugs_for_one_key_across_projects', () => {
    expect(barnSlugFor('e2e-123-456', 'smoke', 'manager')).not.toBe(barnSlugFor('e2e-123-456', 'smoke', 'rider'))
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

describe('assetPath', () => {
  const original = process.cwd()

  afterEach(() => {
    process.chdir(original)
  })

  it('should_resolve_a_committed_asset_to_a_file_that_exists', () => {
    expect(existsSync(assetPath('test_1_kb.pdf'))).toBe(true)
  })

  it('should_return_an_absolute_path', () => {
    expect(isAbsolute(assetPath('test_1_kb.pdf'))).toBe(true)
  })

  it('should_resolve_under_scripts_data', () => {
    expect(assetPath('butter-photo.jpg').endsWith('/scripts/data/butter-photo.jpg')).toBe(true)
  })

  // The whole point of resolving from the module path: Playwright and tsx run this file from
  // the repo root, but nothing guarantees that, and a cwd-relative path fails silently-ish.
  it('should_resolve_the_same_path_from_any_working_directory', () => {
    const fromRoot = assetPath('test_1_kb.pdf')
    process.chdir('/')
    expect(assetPath('test_1_kb.pdf')).toBe(fromRoot)
  })

  it('should_throw_naming_the_missing_asset', () => {
    expect(() => assetPath('no-such-asset.pdf')).toThrow(/scripts\/data\/no-such-asset\.pdf/)
  })
})
