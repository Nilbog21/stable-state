import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

afterEach(cleanup)

vi.mock('../actions', () => ({ createOrResumeDemoBarn: vi.fn() }))

import { createOrResumeDemoBarn } from '../actions'
import { DemoLoader } from '../DemoLoader'

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
})
