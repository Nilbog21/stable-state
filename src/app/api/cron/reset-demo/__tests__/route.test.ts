import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn } from '@/test/fixtures'

vi.mock('@/lib/db/barns', () => ({
  getOldestDemoBarn: vi.fn(),
  countDemoBarns: vi.fn(),
  deleteBarn: vi.fn(),
}))
vi.mock('@/lib/db/service-role', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/service-role')>()
  return {
    ...actual,
    createServiceClient: vi.fn(),
    teardownBarnData: vi.fn(),
  }
})

import { getOldestDemoBarn, countDemoBarns, deleteBarn } from '@/lib/db/barns'
import { createServiceClient, teardownBarnData } from '@/lib/db/service-role'
import { POST } from '../route'

function makeRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/cron/reset-demo', { method: 'POST', headers })
}

const OLD_BARN = createMockBarn({ id: 'old-barn', created_at: '2020-01-01T00:00:00.000Z' })
const RECENT_BARN = createMockBarn({ id: 'recent-barn', created_at: new Date().toISOString() })

describe('POST /api/cron/reset-demo', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret')
    vi.stubEnv('DEMO_BARN_CAP', '20')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')

    vi.mocked(getOldestDemoBarn).mockReset().mockResolvedValue(null)
    vi.mocked(countDemoBarns).mockReset().mockResolvedValue(0)
    vi.mocked(deleteBarn).mockReset()
    vi.mocked(createServiceClient).mockReset().mockReturnValue({} as any)
    vi.mocked(teardownBarnData).mockReset()
  })

  it('should_return_401_when_authorization_header_missing', async () => {
    const response = await POST(makeRequest() as any)
    expect(response.status).toBe(401)
  })

  it('should_return_401_when_authorization_header_does_not_match_cron_secret', async () => {
    const response = await POST(makeRequest({ authorization: 'Bearer wrong-secret' }) as any)
    expect(response.status).toBe(401)
  })

  it('should_return_401_when_cron_secret_env_var_is_unset', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const response = await POST(makeRequest({ authorization: 'Bearer test-secret' }) as any)
    expect(response.status).toBe(401)
  })

  it('should_return_500_when_supabase_url_or_service_role_key_missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    const response = await POST(makeRequest({ authorization: 'Bearer test-secret' }) as any)
    expect(response.status).toBe(500)
  })

  it('should_return_zero_reaped_when_no_demo_barns_exist', async () => {
    const response = await POST(makeRequest({ authorization: 'Bearer test-secret' }) as any)
    const body = await response.json()
    expect(body).toEqual({ reaped: 0 })
  })

  it('should_default_demo_barn_cap_to_20_when_env_var_unset', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('CRON_SECRET', 'test-secret')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')
    vi.mocked(getOldestDemoBarn).mockResolvedValue(RECENT_BARN)
    vi.mocked(countDemoBarns).mockResolvedValue(20)

    const response = await POST(makeRequest({ authorization: 'Bearer test-secret' }) as any)
    const body = await response.json()

    expect(teardownBarnData).not.toHaveBeenCalled()
    expect(body).toEqual({ reaped: 0 })
  })

  it('should_reap_a_demo_barn_older_than_six_hours', async () => {
    vi.mocked(getOldestDemoBarn).mockResolvedValueOnce(OLD_BARN).mockResolvedValueOnce(null)
    vi.mocked(countDemoBarns).mockResolvedValue(1)

    const response = await POST(makeRequest({ authorization: 'Bearer test-secret' }) as any)
    const body = await response.json()

    expect(teardownBarnData).toHaveBeenCalledWith('old-barn', expect.anything())
    expect(deleteBarn).toHaveBeenCalledWith('old-barn', expect.anything())
    expect(body).toEqual({ reaped: 1 })
  })

  it('should_stop_reaping_once_oldest_remaining_barn_is_within_six_hours_and_under_cap', async () => {
    vi.mocked(getOldestDemoBarn).mockResolvedValue(RECENT_BARN)
    vi.mocked(countDemoBarns).mockResolvedValue(1)

    const response = await POST(makeRequest({ authorization: 'Bearer test-secret' }) as any)
    const body = await response.json()

    expect(teardownBarnData).not.toHaveBeenCalled()
    expect(body).toEqual({ reaped: 0 })
  })

  it('should_reap_additional_barns_when_over_cap_even_if_not_expired', async () => {
    vi.stubEnv('DEMO_BARN_CAP', '1')
    vi.mocked(getOldestDemoBarn).mockResolvedValueOnce(RECENT_BARN).mockResolvedValueOnce(null)
    vi.mocked(countDemoBarns).mockResolvedValue(2)

    const response = await POST(makeRequest({ authorization: 'Bearer test-secret' }) as any)
    const body = await response.json()

    expect(teardownBarnData).toHaveBeenCalledWith('recent-barn', expect.anything())
    expect(body).toEqual({ reaped: 1 })
  })

  it('should_not_enforce_cap_when_demo_barn_cap_is_zero', async () => {
    vi.stubEnv('DEMO_BARN_CAP', '0')
    vi.mocked(getOldestDemoBarn).mockResolvedValue(RECENT_BARN)
    vi.mocked(countDemoBarns).mockResolvedValue(50)

    const response = await POST(makeRequest({ authorization: 'Bearer test-secret' }) as any)
    const body = await response.json()

    expect(teardownBarnData).not.toHaveBeenCalled()
    expect(body).toEqual({ reaped: 0 })
  })
})
