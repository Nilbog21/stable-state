import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { createMockHorse } from '@/test/fixtures'
import { HorseNotesForm } from '../HorseNotesForm'
import { withBlocker } from '@/test/navigation-blocker-harness'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const horse = createMockHorse({ feed_notes: null, medication_notes: null })

function deferredAction() {
  let resolve!: (result: { error: string | null }) => void
  const promise = new Promise<{ error: string | null }>((r) => { resolve = r })
  return { action: vi.fn(() => promise), resolve }
}

describe('HorseNotesForm — navigation dirty state', () => {
  it('should_start_clean', () => {
    render(withBlocker(<HorseNotesForm horse={horse} action={vi.fn()} />))
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_set_dirty_when_feed_notes_changed', () => {
    render(withBlocker(<HorseNotesForm horse={horse} action={vi.fn()} />))
    fireEvent.change(screen.getByRole('textbox', { name: /feed notes/i }), { target: { value: '1 flake AM' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  it('should_clear_dirty_after_successful_save', async () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    render(withBlocker(<HorseNotesForm horse={horse} action={action} />))
    fireEvent.change(screen.getByRole('textbox', { name: /feed notes/i }), { target: { value: '1 flake AM' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_stay_dirty_while_save_is_in_flight', async () => {
    // onSubmit clears the flag on click, so only the action's pending flag keeps the guard armed
    // across the round trip — the window #1362 built it for.
    const { action, resolve } = deferredAction()
    render(withBlocker(<HorseNotesForm horse={horse} action={action} />))
    fireEvent.change(screen.getByRole('textbox', { name: /feed notes/i }), { target: { value: '1 flake AM' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
    // Settle before unmount, or the still-open transition leaks into the next test's render
    await act(async () => {
      resolve({ error: null })
      await Promise.resolve()
    })
  })

  it('should_stay_dirty_after_failed_save', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'boom' })
    render(withBlocker(<HorseNotesForm horse={horse} action={action} />))
    fireEvent.change(screen.getByRole('textbox', { name: /feed notes/i }), { target: { value: '1 flake AM' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
