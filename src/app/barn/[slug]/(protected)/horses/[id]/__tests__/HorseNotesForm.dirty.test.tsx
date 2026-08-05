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
