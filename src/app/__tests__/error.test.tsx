import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Error from '../error'

describe('Error', () => {
  it('should_render_friendly_heading', () => {
    render(<Error error={new Error('boom')} reset={vi.fn()} />)
    expect(screen.getByText('Something went wrong')).toBeDefined()
  })

  it('should_render_try_again_button', () => {
    render(<Error error={new Error('boom')} reset={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined()
  })

  it('should_call_reset_when_try_again_clicked', () => {
    const reset = vi.fn()
    render(<Error error={new Error('boom')} reset={reset} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
