import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mustSucceed, runCronJob } from './script-utils'

describe('mustSucceed', () => {
  it('should_throw_with_label_and_message_when_result_has_error', () => {
    expect(() =>
      mustSucceed({ data: null, error: { message: 'boom' } }, 'test-label')
    ).toThrow('test-label: boom')
  })

  it('should_return_data_when_result_has_no_error', () => {
    expect(mustSucceed({ data: [1, 2, 3], error: null }, 'ok')).toEqual([1, 2, 3])
  })
})

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
