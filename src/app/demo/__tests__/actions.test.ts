import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockUser, createMockBarn } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
  countDemoBarns: vi.fn(),
  getOldestDemoBarn: vi.fn(),
  deleteBarn: vi.fn(),
}))
vi.mock('@/lib/db/service-role', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/service-role')>()
  return {
    ...actual,
    createServiceClient: vi.fn(),
    findOrCreateAuthUser: vi.fn(),
    teardownBarnData: vi.fn(),
  }
})
vi.mock('../../../../scripts/seed-barn', () => ({
  seedBarn: vi.fn(),
  DEV_MANAGER_2: { email: 'manager2@dev.local', firstName: 'Morgan', lastName: 'Manager' },
}))

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

const mockCookies = vi.hoisted(() => vi.fn())
vi.mock('next/headers', () => ({ cookies: mockCookies }))

import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug, countDemoBarns, getOldestDemoBarn, deleteBarn } from '@/lib/db/barns'
import { createServiceClient, findOrCreateAuthUser, teardownBarnData } from '@/lib/db/service-role'
import { seedBarn } from '../../../../scripts/seed-barn'
import { createOrResumeDemoBarn } from '../actions'

function mockCookieStore(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  const get = vi.fn((name: string) => (store.has(name) ? { value: store.get(name)! } : undefined))
  const set = vi.fn((name: string, value: string) => { store.set(name, value) })
  mockCookies.mockResolvedValue({ get, set })
  return { get, set }
}

function makeServiceClient(opts: {
  membershipCheck?: { data: unknown; error: unknown }
  barnInsert?: { data: unknown; error: unknown }
  profileSelect?: { data: unknown; error: unknown }
  membershipInsert?: { error: unknown }
} = {}) {
  const membershipCheck = opts.membershipCheck ?? { data: null, error: null }
  const barnInsert = opts.barnInsert ?? { data: { id: 'new-barn-1', slug: 'demo-abc12345', name: 'Demo Barn' }, error: null }
  const profileSelect = opts.profileSelect ?? { data: { id: 'profile-1' }, error: null }
  const membershipInsert = opts.membershipInsert ?? { error: null }

  const from = vi.fn((table: string) => {
    if (table === 'barn_memberships') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(membershipCheck),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue(membershipInsert),
      }
    }
    if (table === 'barns') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(barnInsert),
          }),
        }),
      }
    }
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(profileSelect),
          }),
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })

  return { from } as any
}

describe('createOrResumeDemoBarn', () => {
  const demoUser = createMockUser({ id: 'demo-user-1', email: 'demo@stable-state.app' })

  beforeEach(() => {
    vi.stubEnv('DEMO_USER_EMAIL', 'demo@stable-state.app')
    vi.stubEnv('DEMO_USER_PASSWORD', 'demo-password')
    vi.stubEnv('DEMO_BARN_CAP', '20')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')

    mockRedirect.mockClear()
    vi.mocked(createClient).mockReset()
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(countDemoBarns).mockReset().mockResolvedValue(0)
    vi.mocked(getOldestDemoBarn).mockReset()
    vi.mocked(deleteBarn).mockReset()
    vi.mocked(createServiceClient).mockReset()
    vi.mocked(findOrCreateAuthUser).mockReset().mockResolvedValue('morgan-user-1')
    vi.mocked(teardownBarnData).mockReset()
    vi.mocked(seedBarn).mockReset().mockResolvedValue(undefined as any)

    setupAuth(demoUser)
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient())
    mockCookieStore()
  })

  it('should_redirect_to_login_when_demo_user_email_missing', async () => {
    vi.stubEnv('DEMO_USER_EMAIL', '')
    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login?error=demo_unavailable')
  })

  it('should_redirect_to_login_when_demo_user_password_missing', async () => {
    vi.stubEnv('DEMO_USER_PASSWORD', '')
    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login?error=demo_unavailable')
  })

  it('should_sign_in_as_demo_user_when_unauthenticated', async () => {
    setupAuth(null)
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { user: demoUser }, error: null })
    vi.mocked(createClient).mockResolvedValue({ auth: { signInWithPassword } } as any)

    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')

    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'demo@stable-state.app', password: 'demo-password' })
    expect(seedBarn).toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_sign_in_fails', async () => {
    setupAuth(null)
    vi.mocked(createClient).mockResolvedValue({
      auth: { signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'bad credentials' } }) },
    } as any)

    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login?error=demo_unavailable')
    expect(seedBarn).not.toHaveBeenCalled()
  })

  it('should_use_existing_session_when_already_authenticated', async () => {
    const signInWithPassword = vi.fn()
    vi.mocked(createClient).mockResolvedValue({ auth: { signInWithPassword } } as any)

    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')

    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(seedBarn).toHaveBeenCalled()
  })

  it('should_redirect_immediately_when_resume_cookie_barn_and_membership_exist', async () => {
    mockCookieStore({ demo_barn_slug: 'demo-existing' })
    const existingBarn = createMockBarn({ id: 'existing-barn-1', slug: 'demo-existing', is_demo: true })
    vi.mocked(getBarnBySlug).mockResolvedValue(existingBarn)
    vi.mocked(createServiceClient).mockReturnValue(
      makeServiceClient({ membershipCheck: { data: { id: 'membership-1' }, error: null } })
    )

    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/demo-existing/')
    expect(seedBarn).not.toHaveBeenCalled()
  })

  it('should_create_new_barn_when_resume_cookie_barn_no_longer_exists', async () => {
    mockCookieStore({ demo_barn_slug: 'demo-gone' })
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')

    expect(seedBarn).toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith('/barn/demo-abc12345/')
  })

  it('should_create_new_barn_when_resume_cookie_barn_exists_but_visitor_has_no_membership', async () => {
    mockCookieStore({ demo_barn_slug: 'demo-someone-elses' })
    const otherBarn = createMockBarn({ id: 'other-barn-1', slug: 'demo-someone-elses', is_demo: true })
    vi.mocked(getBarnBySlug).mockResolvedValue(otherBarn)
    vi.mocked(createServiceClient).mockReturnValue(
      makeServiceClient({ membershipCheck: { data: null, error: null } })
    )

    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')

    expect(seedBarn).toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith('/barn/demo-abc12345/')
  })

  it('should_not_reap_when_cap_not_reached', async () => {
    vi.mocked(countDemoBarns).mockResolvedValue(19)

    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')

    expect(getOldestDemoBarn).not.toHaveBeenCalled()
    expect(teardownBarnData).not.toHaveBeenCalled()
    expect(deleteBarn).not.toHaveBeenCalled()
  })

  it('should_reap_oldest_barn_when_cap_reached', async () => {
    vi.mocked(countDemoBarns).mockResolvedValue(20)
    const oldest = createMockBarn({ id: 'oldest-barn-1', slug: 'demo-oldest', is_demo: true })
    vi.mocked(getOldestDemoBarn).mockResolvedValue(oldest)

    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')

    expect(teardownBarnData).toHaveBeenCalledWith('oldest-barn-1', expect.anything())
    expect(deleteBarn).toHaveBeenCalledWith('oldest-barn-1', expect.anything())
  })

  it('should_not_reap_when_cap_reached_but_no_demo_barns_found', async () => {
    vi.mocked(countDemoBarns).mockResolvedValue(20)
    vi.mocked(getOldestDemoBarn).mockResolvedValue(null)

    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')

    expect(teardownBarnData).not.toHaveBeenCalled()
    expect(deleteBarn).not.toHaveBeenCalled()
  })

  it('should_default_the_cap_to_20_when_demo_barn_cap_env_var_is_unset', async () => {
    delete process.env.DEMO_BARN_CAP
    vi.mocked(countDemoBarns).mockResolvedValue(20)
    const oldest = createMockBarn({ id: 'oldest-barn-1', slug: 'demo-oldest', is_demo: true })
    vi.mocked(getOldestDemoBarn).mockResolvedValue(oldest)

    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')

    expect(deleteBarn).toHaveBeenCalledWith('oldest-barn-1', expect.anything())
  })

  it('should_skip_cap_check_when_cap_is_zero', async () => {
    vi.stubEnv('DEMO_BARN_CAP', '0')

    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')

    expect(countDemoBarns).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_visitor_profile_missing', async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient({ profileSelect: { data: null, error: null } }))

    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/login?error=demo_unavailable')
  })

  it('should_seed_the_new_barn_and_add_the_visitor_as_manager', async () => {
    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')

    expect(findOrCreateAuthUser).toHaveBeenCalledWith('manager2@dev.local', expect.anything())
    expect(seedBarn).toHaveBeenCalledWith(expect.anything(), 'new-barn-1', 'demo-abc12345', 'morgan-user-1')
  })

  it('should_set_demo_barn_slug_and_barn_session_cookies_on_a_new_barn', async () => {
    const { set } = mockCookieStore()

    await expect(createOrResumeDemoBarn()).rejects.toThrow('NEXT_REDIRECT')

    expect(set).toHaveBeenCalledWith('demo_barn_slug', 'demo-abc12345', expect.objectContaining({ path: '/' }))
    expect(set).toHaveBeenCalledWith('barn_session_demo-abc12345', 'demo-user-1', expect.objectContaining({ path: '/barn/demo-abc12345/' }))
  })
})
