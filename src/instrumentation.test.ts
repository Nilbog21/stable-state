import { describe, it, expect, vi, afterEach } from 'vitest'
import { register } from './instrumentation'

describe('register', () => {
  const ORIGINAL_DEV_SUPABASE_URL = process.env.DEV_SUPABASE_URL
  const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

  afterEach(() => {
    if (ORIGINAL_DEV_SUPABASE_URL === undefined) {
      delete process.env.DEV_SUPABASE_URL
    } else {
      process.env.DEV_SUPABASE_URL = ORIGINAL_DEV_SUPABASE_URL
    }
    if (ORIGINAL_SUPABASE_URL === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL
    }
    vi.restoreAllMocks()
  })

  it('should_not_warn_when_dev_supabase_url_is_unset', () => {
    delete process.env.DEV_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod-project.supabase.co'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    register()

    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('should_not_warn_when_supabase_url_matches_dev_supabase_url', () => {
    process.env.DEV_SUPABASE_URL = 'https://dev-project.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://dev-project.supabase.co'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    register()

    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('should_warn_when_supabase_url_does_not_match_dev_supabase_url', () => {
    process.env.DEV_SUPABASE_URL = 'https://dev-project.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod-project.supabase.co'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    register()

    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})
