import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from '../error'

describe('Error', () => {
  it('should_render_friendly_heading', () => {
    render(<ErrorBoundary error={new Error('boom')} reset={vi.fn()} />)
    expect(screen.getByText('Something went wrong')).toBeDefined()
  })

  it('should_render_try_again_button', () => {
    render(<ErrorBoundary error={new Error('boom')} reset={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined()
  })

  // The one claim `checklists/pre-release/phase-1-setup.md` gave up when #1561 collapsed its
  // three error-boundary lines to one: a dev server can never show it, since Next's overlay
  // prints the trace unconditionally.
  it('should_not_render_the_error_message_or_stack', () => {
    const error = new Error('boom')
    const { container } = render(<ErrorBoundary error={error} reset={vi.fn()} />)
    expect(container.textContent).not.toContain(error.message)
    // A stack frame's shape rather than the whole `error.stack` string: a partial render (the
    // frames without their `Error: boom` header) leaks just as much and survives a whole-string
    // containment check — measured, one of #1561's mutants.
    expect(container.textContent).not.toMatch(/at\s+\S+:\d+:\d+/)
  })

  it('should_call_reset_when_try_again_clicked', () => {
    const reset = vi.fn()
    render(<ErrorBoundary error={new Error('boom')} reset={reset} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
