import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { redirect } from 'next/navigation'

afterEach(cleanup)

vi.mock('../actions', () => ({ createOrResumeDemoBarn: vi.fn() }))

import { createOrResumeDemoBarn } from '../actions'
import { DemoLoader } from '../DemoLoader'

function getRedirectError(): unknown {
  try {
    redirect('/barn/demo-test/')
  } catch (err) {
    return err
  }
  throw new Error('redirect() did not throw')
}

describe('DemoLoader', () => {
  it('should_render_spinner_and_heading_while_loading', () => {
    vi.mocked(createOrResumeDemoBarn).mockReturnValue(new Promise(() => {}))

    render(<DemoLoader />)

    expect(screen.getByText('Explore Stable State')).toBeDefined()
  })

  it('should_call_the_action_once_on_mount', async () => {
    vi.mocked(createOrResumeDemoBarn).mockReturnValue(new Promise(() => {}))

    render(<DemoLoader />)

    await waitFor(() => expect(createOrResumeDemoBarn).toHaveBeenCalledTimes(1))
  })

  it('should_call_the_action_only_once_even_under_strict_mode_double_invoke', async () => {
    vi.mocked(createOrResumeDemoBarn).mockReturnValue(new Promise(() => {}))

    render(
      <React.StrictMode>
        <DemoLoader />
      </React.StrictMode>
    )

    await waitFor(() => expect(createOrResumeDemoBarn).toHaveBeenCalledTimes(1))
  })

  it('should_render_a_failure_message_with_a_retry_link_when_the_action_throws', async () => {
    vi.mocked(createOrResumeDemoBarn).mockRejectedValue(new Error('boom'))

    render(<DemoLoader />)

    await waitFor(() => expect(screen.getByText("Couldn't start the demo")).toBeDefined())
    expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe('/demo')
  })

  it('should_rethrow_a_redirect_error_instead_of_swallowing_it', async () => {
    vi.mocked(createOrResumeDemoBarn).mockRejectedValue(getRedirectError())

    const onUnhandledRejection = vi.fn()
    process.once('unhandledRejection', onUnhandledRejection)

    render(<DemoLoader />)

    await waitFor(() => expect(onUnhandledRejection).toHaveBeenCalledTimes(1))
  })

  it('should_not_show_failure_state_when_the_action_rejects_with_a_redirect_error', async () => {
    vi.mocked(createOrResumeDemoBarn).mockRejectedValue(getRedirectError())

    const settled = new Promise<void>((resolve) => process.once('unhandledRejection', () => resolve()))

    render(<DemoLoader />)
    await settled

    expect(screen.queryByText("Couldn't start the demo")).toBeNull()
  })
})
