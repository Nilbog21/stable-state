import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('next/navigation', () => ({ notFound: vi.fn() }))
vi.mock('../DemoLoader', () => ({ DemoLoader: () => <div>demo-loader</div> }))

import { notFound } from 'next/navigation'
import DemoPage from '../page'

describe('DemoPage', () => {
  beforeEach(() => {
    vi.mocked(notFound).mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should_call_notFound_when_demo_user_email_is_not_set', () => {
    vi.stubEnv('DEMO_USER_EMAIL', '')
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })

    expect(() => DemoPage()).toThrow('NEXT_NOT_FOUND')
  })

  it('should_render_demo_loader_when_demo_user_email_is_set', () => {
    vi.stubEnv('DEMO_USER_EMAIL', 'demo@stable-state.app')

    render(DemoPage())

    expect(screen.getByText('demo-loader')).toBeDefined()
  })
})
