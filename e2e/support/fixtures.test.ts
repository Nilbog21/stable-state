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
  authStorageState,
  createThrowawayAuthUser,
  deleteThrowawayAuthUser,
  throwawayAuthEmail,
  E2E_PASSWORD,
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

/**
 * #1425's throwaway auth user — the one login the suite creates and destroys inside a single
 * spec file, rather than bootstrapping per project the way E2E_USERS are. Every case here is a
 * property of the helper's *contract*, asserted against a hand-made client, because the real
 * calls are `auth.admin.*` against the dev project and are not something a unit test may make.
 */
describe('throwawayAuthEmail', () => {
  const PREFIX = 'e2e-123-456'
  const KEY = 'invite'

  it('should_derive_a_distinct_email_per_project', () => {
    expect(throwawayAuthEmail(PREFIX, KEY, 'manager')).not.toBe(throwawayAuthEmail(PREFIX, KEY, 'rider'))
  })

  it('should_derive_a_distinct_email_per_run', () => {
    expect(throwawayAuthEmail(PREFIX, KEY, 'manager')).not.toBe(throwawayAuthEmail('e2e-999-1', KEY, 'manager'))
  })

  // The half a project-only key would lose: a second spec file wanting a throwaway login under
  // the same project would otherwise derive this file's address and race its create/delete.
  it('should_derive_a_distinct_email_per_spec_file', () => {
    expect(throwawayAuthEmail(PREFIX, KEY, 'manager')).not.toBe(throwawayAuthEmail(PREFIX, 'other', 'manager'))
  })

  // Not a sweep requirement — nothing sweeps auth users by prefix — but a leaked login is found
  // by a human grepping the dashboard, and the prefix is what tells them which run left it.
  it('should_keep_the_run_prefix_leading', () => {
    expect(throwawayAuthEmail(PREFIX, KEY, 'manager').startsWith(`${PREFIX}-`)).toBe(true)
  })

  it('should_use_the_same_domain_as_the_shared_logins', () => {
    expect(throwawayAuthEmail(PREFIX, KEY, 'manager').endsWith('@e2e.test')).toBe(true)
  })

  /**
   * E2E_STUB_RIDER's containment rule, reaching addresses rather than names: the nav bar's user
   * menu renders `user.email`, and every Playwright text matcher is substring-based. A local
   * part *ending* in the project name would spell `…-manager@e2e.test`, which contains the
   * `manager@e2e.test` shared login outright — so the project name may not be the last token.
   */
  it('should_contain_no_shared_login_email_as_a_substring', () => {
    const emails = Object.values(E2E_USERS).map((u) => u.email)
    const derived = ['manager', 'trainer', 'rider'].map((p) => throwawayAuthEmail(PREFIX, KEY, p))
    expect(derived.filter((d) => emails.some((e) => d.includes(e)))).toEqual([])
  })
})

type StubOptions = {
  createUserResult?: { data: { user: { id: string } } | null; error: { message: string } | null }
  deleteUserResult?: { error: { message: string } | null }
  profileDeleteResult?: { data: null; error: { message: string } | null }
}

/**
 * A client that records the order of the three operations these two helpers make, because the
 * order is the contract: `profiles.user_id → auth.users` cascades, so deleting the auth user
 * first would take the profile row with it, and a `barn_memberships.profile_id` still pointing
 * at that row would fail the delete from underneath rather than name it.
 */
function stubClient(opts: StubOptions = {}) {
  const {
    createUserResult = { data: { user: { id: 'throwaway-user-id' } }, error: null },
    deleteUserResult = { error: null },
    profileDeleteResult = { data: null, error: null },
  } = opts
  const calls: string[] = []
  const createUser = vi.fn(async () => { calls.push('createUser'); return createUserResult })
  const deleteUser = vi.fn(async () => { calls.push('deleteUser'); return deleteUserResult })
  const eq = vi.fn(async () => { calls.push('deleteProfile'); return profileDeleteResult })
  const del = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ delete: del }))
  const client = { auth: { admin: { createUser, deleteUser } }, from } as unknown as SupabaseClient
  return { client, calls, createUser, deleteUser, from, del, eq }
}

describe('createThrowawayAuthUser', () => {
  const EMAIL = 'e2e-123-456-invite-manager-invite@e2e.test'

  it('should_create_a_confirmed_login_on_the_suite_password', async () => {
    const stub = stubClient()
    await createThrowawayAuthUser(stub.client, EMAIL)
    expect(stub.createUser).toHaveBeenCalledWith({ email: EMAIL, password: E2E_PASSWORD, email_confirm: true })
  })

  it('should_return_the_new_user_id', async () => {
    expect(await createThrowawayAuthUser(stubClient().client, EMAIL)).toBe('throwaway-user-id')
  })

  /**
   * The load-bearing omission. `claim_managed_member` converts the *stub* profile in place —
   * setting `user_id`, `email` and `is_managed = false`, leaving the contact fields blank, which
   * is the precondition the /profile/complete checklist line names. A profile row created here
   * would send the claim down its other branch, which deletes the stub and keeps this row's
   * already-filled fields instead.
   */
  it('should_create_no_profile_row', async () => {
    const stub = stubClient()
    await createThrowawayAuthUser(stub.client, EMAIL)
    expect(stub.from).not.toHaveBeenCalled()
  })

  it('should_throw_naming_the_email_when_creation_fails', async () => {
    const stub = stubClient({ createUserResult: { data: null, error: { message: 'rate limited' } } })
    await expect(createThrowawayAuthUser(stub.client, EMAIL)).rejects.toThrow(/e2e-123-456-invite-manager-invite@e2e\.test.*rate limited/)
  })

  it('should_throw_naming_the_email_when_no_user_comes_back', async () => {
    const stub = stubClient({ createUserResult: { data: null, error: null } })
    await expect(createThrowawayAuthUser(stub.client, EMAIL)).rejects.toThrow(/e2e-123-456-invite-manager-invite@e2e\.test/)
  })
})

describe('deleteThrowawayAuthUser', () => {
  const USER_ID = 'throwaway-user-id'

  it('should_delete_the_profile_row_before_the_auth_user', async () => {
    const stub = stubClient()
    await deleteThrowawayAuthUser(stub.client, USER_ID)
    expect(stub.calls).toEqual(['deleteProfile', 'deleteUser'])
  })

  it('should_delete_the_profile_row_by_user_id', async () => {
    const stub = stubClient()
    await deleteThrowawayAuthUser(stub.client, USER_ID)
    expect(stub.eq).toHaveBeenCalledWith('user_id', USER_ID)
  })

  it('should_delete_from_the_profiles_table', async () => {
    const stub = stubClient()
    await deleteThrowawayAuthUser(stub.client, USER_ID)
    expect(stub.from).toHaveBeenCalledWith('profiles')
  })

  it('should_throw_naming_the_user_when_the_profile_delete_fails', async () => {
    const stub = stubClient({ profileDeleteResult: { data: null, error: { message: 'still referenced' } } })
    await expect(deleteThrowawayAuthUser(stub.client, USER_ID)).rejects.toThrow(/throwaway-user-id.*still referenced/)
  })

  it('should_throw_naming_the_user_when_the_auth_delete_fails', async () => {
    const stub = stubClient({ deleteUserResult: { error: { message: 'not found' } } })
    await expect(deleteThrowawayAuthUser(stub.client, USER_ID)).rejects.toThrow(/throwaway-user-id.*not found/)
  })
})

/**
 * The auth cookie global-setup.ts writes for the three shared logins and the spec mints for its
 * throwaway one — one definition, two callers (#1425). Every property below is something a
 * drifted second copy would get subtly wrong in a way no test above this layer would name.
 */
describe('authStorageState', () => {
  const SUPABASE_URL = 'https://abcdefghijklm.supabase.co'
  const BASE_URL = 'http://localhost:3102'
  const EMAIL = 'manager@e2e.test'
  const SESSION = { access_token: 'token-abc', refresh_token: 'token-def', user: { id: 'user-1' } }

  const original = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    base: process.env.E2E_BASE_URL,
  }

  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    process.env.E2E_BASE_URL = BASE_URL
  })

  afterEach(() => {
    restore('NEXT_PUBLIC_SUPABASE_URL', original.url)
    restore('NEXT_PUBLIC_SUPABASE_ANON_KEY', original.anon)
    restore('E2E_BASE_URL', original.base)
    vi.unstubAllGlobals()
  })

  const stubFetch = (response: { ok: boolean; json?: unknown; text?: string }) => {
    // Parameters declared, unused: `calls[0][0]` below has no type without them, and an
    // `expect.anything()` second argument would have the same problem.
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: response.ok,
      json: async () => response.json,
      text: async () => response.text ?? '',
    }))
    vi.stubGlobal('fetch', fetchSpy)
    return fetchSpy
  }

  const cookie = async () => (await authStorageState(EMAIL, E2E_PASSWORD)).cookies[0]

  it('should_name_the_cookie_for_the_supabase_project_ref', async () => {
    stubFetch({ ok: true, json: SESSION })
    expect((await cookie()).name).toBe('sb-abcdefghijklm-auth-token')
  })

  // `base64-` prefix plus base64url, which is what @supabase/ssr's cookie reader expects; a
  // plain-JSON or standard-base64 value is accepted by the browser and rejected by the app.
  it('should_encode_the_whole_session_into_the_cookie_value', async () => {
    stubFetch({ ok: true, json: SESSION })
    const value = (await cookie()).value
    expect(JSON.parse(Buffer.from(value.replace('base64-', ''), 'base64url').toString())).toEqual(SESSION)
  })

  it('should_scope_the_cookie_to_the_base_url_host', async () => {
    stubFetch({ ok: true, json: SESSION })
    expect((await cookie()).domain).toBe('localhost')
  })

  it('should_request_a_password_grant_for_the_given_email', async () => {
    const fetchSpy = stubFetch({ ok: true, json: SESSION })
    await authStorageState(EMAIL, E2E_PASSWORD)
    expect(fetchSpy.mock.calls[0][0]).toBe(`${SUPABASE_URL}/auth/v1/token?grant_type=password`)
  })

  it('should_carry_no_local_storage_origins', async () => {
    stubFetch({ ok: true, json: SESSION })
    expect((await authStorageState(EMAIL, E2E_PASSWORD)).origins).toEqual([])
  })

  it('should_throw_naming_the_email_when_the_grant_is_rejected', async () => {
    stubFetch({ ok: false, text: 'invalid credentials' })
    await expect(authStorageState(EMAIL, E2E_PASSWORD)).rejects.toThrow(/manager@e2e\.test.*invalid credentials/)
  })

  /**
   * global-setup.ts's own guidance, threaded through rather than lost to the extraction: a
   * missing shared login is fixed by the bootstrap script, and a throwaway login's failure is
   * not, so the sentence belongs to the caller and the email belongs to the helper.
   */
  it('should_append_the_callers_hint_to_a_rejected_grant', async () => {
    stubFetch({ ok: false, text: 'invalid credentials' })
    await expect(authStorageState(EMAIL, E2E_PASSWORD, 'run: bash scripts/e2e-auth-users.sh create')).rejects.toThrow(
      /run: bash scripts\/e2e-auth-users\.sh create/
    )
  })

  it('should_omit_the_hint_when_the_caller_gives_none', async () => {
    stubFetch({ ok: false, text: 'invalid credentials' })
    const message = await authStorageState(EMAIL, E2E_PASSWORD).catch((err: Error) => err.message)
    expect(message).not.toContain('e2e-auth-users')
  })

  // A 200 carrying no user id is the shape a misconfigured project answers with, and it would
  // otherwise mint a cookie the app silently treats as signed-out.
  it('should_throw_naming_the_email_when_the_response_carries_no_user', async () => {
    stubFetch({ ok: true, json: { access_token: 'token-abc' } })
    await expect(authStorageState(EMAIL, E2E_PASSWORD)).rejects.toThrow(/manager@e2e\.test/)
  })

  it('should_throw_when_the_supabase_url_is_unset', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    stubFetch({ ok: true, json: SESSION })
    await expect(authStorageState(EMAIL, E2E_PASSWORD)).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('should_throw_when_the_anon_key_is_unset', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    stubFetch({ ok: true, json: SESSION })
    await expect(authStorageState(EMAIL, E2E_PASSWORD)).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })
})
