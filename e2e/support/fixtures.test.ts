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
  secondBarnKey,
  runPrefix,
  assetPath,
  daysFromNow,
  addUnpaidLesson,
  E2E_USERS,
  E2E_STUB_RIDER,
  type SeededBarn,
} from './fixtures'

vi.mock('@/lib/db/lesson-participants', () => ({ createLessonWithParticipants: vi.fn() }))

// The barn every case below is framed in. `America/New_York` is the e2e default, and it is
// four or five hours behind UTC — which is the whole skew under test, so the zone is named
// rather than left to a fixture's default.
const TZ = 'America/New_York'

// `now` inputs are explicit UTC ISO instants and the anchors' assertions read UTC digits: an
// anchor is a UTC-midnight Date whose *digits* are the barn's month, which is the frame
// formatMonthParam reads and resolveFinancesMonth's startDate/endDate are in.
describe('monthAnchor', () => {
  it('should_land_on_day_15', () => {
    expect(monthAnchor(0, TZ, new Date('2026-07-27T12:00:00Z')).getUTCDate()).toBe(15)
  })

  it('should_stay_in_the_current_month_for_zero', () => {
    expect(monthAnchor(0, TZ, new Date('2026-07-27T12:00:00Z')).getUTCMonth()).toBe(6)
  })

  it('should_step_back_one_month_for_one', () => {
    expect(monthAnchor(1, TZ, new Date('2026-07-27T12:00:00Z')).getUTCMonth()).toBe(5)
  })

  it('should_step_back_two_months_for_two', () => {
    expect(monthAnchor(2, TZ, new Date('2026-07-27T12:00:00Z')).getUTCMonth()).toBe(4)
  })

  it('should_roll_the_year_back_when_stepping_past_january', () => {
    expect(monthAnchor(2, TZ, new Date('2026-01-10T12:00:00Z')).getUTCFullYear()).toBe(2025)
  })

  it('should_wrap_to_november_when_stepping_two_months_back_from_january', () => {
    expect(monthAnchor(2, TZ, new Date('2026-01-10T12:00:00Z')).getUTCMonth()).toBe(10)
  })
})

describe('pastInstantInMonth', () => {
  it('should_return_one_hour_ago_when_mid_month', () => {
    const now = new Date('2026-07-15T14:00:00Z')
    expect(pastInstantInMonth(0, TZ, now).getTime()).toBe(now.getTime() - 60 * 60 * 1000)
  })

  // The barn's month start, not the UTC-digit midnight: `2026-07-01T00:00:00Z` decodes to
  // June 30th at the barn, which is the previous bucket for every expense read.
  it('should_clamp_to_the_barn_month_start_within_the_first_hour_of_the_barn_month', () => {
    expect(pastInstantInMonth(0, TZ, new Date('2026-07-01T04:30:00Z')).toISOString()).toBe('2026-07-01T04:00:00.000Z')
  })

  it('should_delegate_to_month_anchor_for_a_prior_month', () => {
    const now = new Date('2026-07-27T14:00:00Z')
    expect(pastInstantInMonth(1, TZ, now).getTime()).toBe(monthAnchor(1, TZ, now).getTime())
  })
})

/**
 * #1221: `goToDaysAhead` navigates the dashboard barn-relative, so the seed has to be placed
 * barn-relative too. Every case here uses a `now` whose barn-local day differs from its UTC
 * day (23:30 barn-local), which is exactly the skew a runner-relative offset used to smuggle in.
 */
describe('daysFromNow', () => {
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
 * #1360: the app buckets Finances by the *barn's* month (resolveFinancesMonth resolves "now"
 * through barnToday), so these anchors have to as well. Every zone in BARN_TIMEZONES is behind
 * UTC, so for the 4-5 hours each month after UTC rolls over and the barn hasn't, a UTC-framed
 * anchor names next month while resolveFinancesMonth's upper bound clamps the matching
 * `?month=` back down to the barn's — the seed lands in one bucket and every navigation asks
 * for another. (Before #1360 both sides were UTC, which is why #1151's UTC framing held.)
 *
 * `2026-08-01T02:00Z` is that window: August at UTC, still July 31st in `America/New_York`.
 *
 * The runner's own zone is whatever the developer's machine says, so the second half pins TZ
 * rather than depending on it — `Pacific/Niue` (UTC−11) and `Pacific/Kiritimati` (UTC+14)
 * bracket UTC from both sides and neither may move the answer. Mutating process.env.TZ
 * mid-process does repoint Date's local getters on Node — the same save/restore shape the
 * runPrefix block below uses for its own env var.
 */
describe('barn month framing across a zone-skewed month boundary', () => {
  const rollover = new Date('2026-08-01T02:00:00Z')

  it('should_anchor_in_the_barn_month_when_utc_has_already_rolled_over', () => {
    expect(monthAnchor(0, TZ, rollover).getUTCMonth()).toBe(6)
  })

  it('should_step_back_from_the_barn_month_when_utc_has_already_rolled_over', () => {
    expect(monthAnchor(1, TZ, rollover).getUTCMonth()).toBe(5)
  })

  // The last instant still inside July's transaction window — an hour before `now` would be
  // 2026-08-01T01:00Z, which resolveFinancesMonth reads as August while the page shows July.
  it('should_clamp_the_current_month_instant_inside_the_barn_month_when_utc_has_rolled_over', () => {
    expect(pastInstantInMonth(0, TZ, rollover).toISOString()).toBe('2026-07-31T23:59:59.000Z')
  })

  describe('runner zone independence', () => {
    const originalTZ = process.env.TZ

    afterEach(() => {
      if (originalTZ === undefined) delete process.env.TZ
      else process.env.TZ = originalTZ
    })

    it('should_ignore_a_runner_behind_utc', () => {
      process.env.TZ = 'Pacific/Niue'
      expect(monthAnchor(0, TZ, rollover).getUTCMonth()).toBe(6)
    })

    it('should_ignore_a_runner_ahead_of_utc', () => {
      process.env.TZ = 'Pacific/Kiritimati'
      expect(monthAnchor(0, TZ, rollover).getUTCMonth()).toBe(6)
    })

    it('should_ignore_the_runner_zone_when_clamping', () => {
      process.env.TZ = 'Pacific/Kiritimati'
      expect(pastInstantInMonth(0, TZ, rollover).toISOString()).toBe('2026-07-31T23:59:59.000Z')
    })
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

/**
 * #1415: the second barn of a two-barn spec (support/test.ts's withSecondBarn). Every property
 * asserted here is a property of suffixing the *key* rather than barn A's finished slug, which is
 * the whole reason this function exists instead of a `${slug}-b` at the call site.
 */
describe('secondBarnKey', () => {
  const PREFIX = 'e2e-123-456'
  const slugA = barnSlugFor(PREFIX, 'isolation', 'manager')
  const slugB = barnSlugFor(PREFIX, secondBarnKey('isolation'), 'manager')

  it('should_derive_a_distinct_slug_from_the_same_prefix_and_project', () => {
    expect(slugB).not.toBe(slugA)
  })

  /**
   * The containment half of E2E_STUB_RIDER's collision rule, applied to barns. Every Playwright
   * text matcher is substring-based, and createBarn derives the barn's *name* from its slug — so
   * a `${slugA}-b` second slug would make a locator for barn A's nav name select barn B's too.
   * Both directions, since either containment is equally fatal.
   */
  it('should_derive_a_slug_that_neither_contains_nor_is_contained_by_the_first', () => {
    expect([slugA.includes(slugB), slugB.includes(slugA)]).toEqual([false, false])
  })

  // teardown-test-barn.ts sweeps a run's barns with a `${prefix}-%` LIKE, and
  // run-checklist-suite.sh's exit trap is the only thing that reaches a barn whose afterAll
  // never ran. A second barn the sweep can't match is one this fixture leaks by construction.
  it('should_keep_the_run_prefix_leading_so_the_teardown_sweep_still_matches', () => {
    expect(slugB.startsWith(`${PREFIX}-`)).toBe(true)
  })

  it('should_stay_distinct_across_projects_like_the_first_barn', () => {
    expect(barnSlugFor(PREFIX, secondBarnKey('isolation'), 'manager')).not.toBe(
      barnSlugFor(PREFIX, secondBarnKey('isolation'), 'rider')
    )
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

/**
 * #1284: the four members `addMemberships` plants in every seeded barn, held to the two
 * collision constraints stated on `E2E_STUB_RIDER`. This is the guard the previous three
 * reports of the same defect (#1192, #1202, #1208) each worked around locally instead —
 * `last_name` was a bare literal inside an insert, so there was nothing to assert on.
 *
 * Both cases fail on a name whose *rendered* form collides, not on a name that merely looks
 * similar, so they stay silent on any future fixture that is genuinely distinct.
 */
describe('seeded member names', () => {
  type Named = { firstName: string; lastName: string }
  const members: Named[] = [...Object.values(E2E_USERS), E2E_STUB_RIDER]
  const fullName = (who: Named) => `${who.firstName} ${who.lastName}`
  /** What get_calendar_feed renders: first name plus the surname's initial. */
  const truncated = (who: Named) => `${who.firstName} ${who.lastName[0]}.`

  // Filtered rather than asserted pairwise so the failure message names the offending fixture
  // ("Test Rider") instead of just reporting that some pair overlapped.
  it('should_seed_no_member_name_that_contains_another', () => {
    const names = members.map(fullName)
    expect(names.filter((name) => names.some((other) => other !== name && other.includes(name)))).toEqual([])
  })

  it('should_seed_a_distinct_truncated_surname_form_for_every_member', () => {
    const forms = members.map(truncated)
    expect(forms.filter((form, i) => forms.indexOf(form) !== i)).toEqual([])
  })
})
