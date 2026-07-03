import type { CookieOptions } from '@supabase/ssr'

export const REMEMBER_ME_MAX_AGE = 2592000 // 30 days

// Adjusts an auth cookie's lifetime per the user's "Keep me logged in" choice
// ('1'/'0' from the remember_me / remember_me_pref cookies set at login).
// Deletion writes (empty value) and unknown values pass through untouched.
export function applyRememberMe(
  options: CookieOptions,
  value: string,
  remember: string | undefined
): CookieOptions {
  if (!value) return options
  if (remember === '1') return { ...options, maxAge: REMEMBER_ME_MAX_AGE }
  if (remember === '0') {
    const { maxAge: _maxAge, expires: _expires, ...rest } = options
    return rest
  }
  return options
}
