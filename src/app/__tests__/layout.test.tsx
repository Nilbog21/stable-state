import { describe, it, expect, vi } from 'vitest'

vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans', className: '' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono', className: '' }),
}))

import { metadata } from '../layout'

describe('root layout metadata', () => {
  it('should_set_title_to_stable_state', () => {
    expect(metadata.title).toBe('Stable State')
  })

  it('should_not_have_boilerplate_description', () => {
    expect((metadata.description ?? '').toLowerCase()).not.toContain('create next app')
  })
})
