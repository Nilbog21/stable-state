import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runCronJob, assertDevProject } from './script-utils'

// mustSucceed/createServiceClient/findAuthUserIdsByEmails/findOrCreateAuthUser/
// teardownBarnData/teardownAllData moved to src/lib/db/service-role.ts (#505) —
// their tests moved with them to src/lib/db/__tests__/service-role.test.ts.

describe('runCronJob', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost', SUPABASE_SERVICE_ROLE_KEY: 'key' }
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    vi.restoreAllMocks()
  })

  it('should_not_exit_when_job_succeeds', async () => {
    await runCronJob('test-job', async () => ({ summary: 'ok', hadErrors: false }))
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('should_exit_1_when_job_reports_errors', async () => {
    await runCronJob('test-job', async () => ({ summary: 'partial', hadErrors: true }))
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('should_exit_1_when_required_env_var_missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    await runCronJob('test-job', async () => ({ summary: 'unused', hadErrors: false }))
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('should_exit_1_when_job_fn_throws', async () => {
    await runCronJob('test-job', async () => {
      throw new Error('boom')
    })
    expect(process.exit).toHaveBeenCalledWith(1)
  })
})

describe('assertDevProject', () => {
  const ORIGINAL_DEV_SUPABASE_URL = process.env.DEV_SUPABASE_URL

  afterEach(() => {
    if (ORIGINAL_DEV_SUPABASE_URL === undefined) {
      delete process.env.DEV_SUPABASE_URL
    } else {
      process.env.DEV_SUPABASE_URL = ORIGINAL_DEV_SUPABASE_URL
    }
  })

  it('should_throw_when_dev_supabase_url_is_unset', () => {
    delete process.env.DEV_SUPABASE_URL
    expect(() => assertDevProject('https://dev-project.supabase.co')).toThrow('DEV_SUPABASE_URL')
  })

  it('should_throw_when_supabase_url_does_not_match_dev_supabase_url', () => {
    process.env.DEV_SUPABASE_URL = 'https://dev-project.supabase.co'
    expect(() => assertDevProject('https://prod-project.supabase.co')).toThrow('does not match')
  })

  it('should_not_throw_when_supabase_url_matches_dev_supabase_url', () => {
    process.env.DEV_SUPABASE_URL = 'https://dev-project.supabase.co'
    expect(() => assertDevProject('https://dev-project.supabase.co')).not.toThrow()
  })
})
