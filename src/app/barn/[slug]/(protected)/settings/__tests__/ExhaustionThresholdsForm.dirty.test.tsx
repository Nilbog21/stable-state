import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { createMockBarn } from '@/test/fixtures'
import { ExhaustionThresholdsForm } from '../ExhaustionThresholdsForm'
import { withBlocker } from '@/test/navigation-blocker-harness'

afterEach(cleanup)

const mockBarn = createMockBarn({ exhaustion_threshold_moderate: 5, exhaustion_threshold_high: 11 })

function deferredAction() {
  let resolve!: (result: { error: string | null }) => void
  const promise = new Promise<{ error: string | null }>((r) => { resolve = r })
  return { action: vi.fn(() => promise), resolve }
}

describe('ExhaustionThresholdsForm — navigation dirty state', () => {
  it('should_start_clean', () => {
    render(withBlocker(<ExhaustionThresholdsForm barn={mockBarn} action={vi.fn()} />))
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_set_dirty_when_moderate_threshold_changed', () => {
    render(withBlocker(<ExhaustionThresholdsForm barn={mockBarn} action={vi.fn()} />))
    fireEvent.change(screen.getByLabelText(/moderate threshold/i), { target: { value: '7' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  it('should_clear_dirty_after_successful_save', async () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    render(withBlocker(<ExhaustionThresholdsForm barn={mockBarn} action={action} />))
    fireEvent.change(screen.getByLabelText(/moderate threshold/i), { target: { value: '7' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_stay_dirty_while_save_is_in_flight', async () => {
    // onSubmit clears the flag on click, so only the action's pending flag keeps the guard armed
    // across the round trip — the window #1362 built it for.
    const { action, resolve } = deferredAction()
    render(withBlocker(<ExhaustionThresholdsForm barn={mockBarn} action={action} />))
    fireEvent.change(screen.getByLabelText(/moderate threshold/i), { target: { value: '7' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
    await act(async () => {
      resolve({ error: null })
    })
  })

  it('should_stay_dirty_after_failed_save', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'boom' })
    render(withBlocker(<ExhaustionThresholdsForm barn={mockBarn} action={action} />))
    fireEvent.change(screen.getByLabelText(/moderate threshold/i), { target: { value: '7' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
