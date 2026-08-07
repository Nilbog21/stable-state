import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { createMockBarn, createMockHorse } from '@/test/fixtures'
import { HorseManagerForm } from '../HorseManagerForm'
import { withBlocker } from '@/test/navigation-blocker-harness'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const mockBarn = createMockBarn({ exhaustion_threshold_moderate: 5, exhaustion_threshold_high: 11 })
const activeHorse = createMockHorse({
  is_active: true,
  is_available: true,
  unavailability_reason: null,
  exhaustion_threshold_moderate: null,
  exhaustion_threshold_high: null,
})

function submitForm() {
  fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
}

function deferredAction() {
  let resolve!: (result: { error: string | null }) => void
  const promise = new Promise<{ error: string | null }>((r) => { resolve = r })
  return { action: vi.fn(() => promise), resolve }
}

describe('HorseManagerForm — navigation dirty state', () => {
  it('should_start_clean', () => {
    render(withBlocker(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={vi.fn()} />))
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_set_dirty_when_name_changed', () => {
    render(withBlocker(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={vi.fn()} />))
    fireEvent.change(screen.getByRole('textbox', { name: /^barn name$/i }), { target: { value: 'Comet' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  it('should_set_dirty_when_status_pill_clicked', () => {
    render(withBlocker(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={vi.fn()} />))
    fireEvent.click(screen.getByRole('button', { name: /^unavailable$/i }))
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  it('should_clear_dirty_after_successful_save', async () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    render(withBlocker(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={action} />))
    fireEvent.change(screen.getByRole('textbox', { name: /^barn name$/i }), { target: { value: 'Comet' } })
    await act(async () => submitForm())
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_stay_dirty_while_save_is_in_flight', async () => {
    // onSubmit clears the flag on click, so only the action's pending flag keeps the guard armed
    // across the round trip — the window #1362 built it for.
    const { action, resolve } = deferredAction()
    render(withBlocker(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={action} />))
    fireEvent.change(screen.getByRole('textbox', { name: /^barn name$/i }), { target: { value: 'Comet' } })
    await act(async () => submitForm())
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
    await act(async () => {
      resolve({ error: null })
    })
  })

  it('should_stay_dirty_after_failed_save', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'boom' })
    render(withBlocker(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={action} />))
    fireEvent.change(screen.getByRole('textbox', { name: /^barn name$/i }), { target: { value: 'Comet' } })
    await act(async () => submitForm())
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
