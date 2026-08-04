import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { createMockHorse } from '@/test/fixtures'
import { HorseNotesForm } from '../HorseNotesForm'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const horseWithNotes = createMockHorse({
  feed_notes: '2 flakes hay AM/PM',
  medication_notes: 'Bute 1g daily',
})
const horseWithoutNotes = createMockHorse({ feed_notes: null, medication_notes: null })

const mockAction = vi.fn().mockResolvedValue({ error: null })

describe('HorseNotesForm', () => {
  it('should_render_feed_notes_textarea', () => {
    render(<HorseNotesForm horse={horseWithoutNotes} action={mockAction} />)
    expect(screen.getByRole('textbox', { name: /feed notes/i })).toBeDefined()
  })

  it('should_render_medication_notes_textarea', () => {
    render(<HorseNotesForm horse={horseWithoutNotes} action={mockAction} />)
    expect(screen.getByRole('textbox', { name: /medication notes/i })).toBeDefined()
  })

  it('should_prefill_feed_notes_textarea_with_horse_value', () => {
    render(<HorseNotesForm horse={horseWithNotes} action={mockAction} />)
    expect((screen.getByRole('textbox', { name: /feed notes/i }) as HTMLTextAreaElement).value).toBe('2 flakes hay AM/PM')
  })

  it('should_prefill_medication_notes_textarea_with_horse_value', () => {
    render(<HorseNotesForm horse={horseWithNotes} action={mockAction} />)
    expect((screen.getByRole('textbox', { name: /medication notes/i }) as HTMLTextAreaElement).value).toBe('Bute 1g daily')
  })

  it('should_render_feed_notes_textarea_empty_when_horse_value_is_null', () => {
    render(<HorseNotesForm horse={horseWithoutNotes} action={mockAction} />)
    expect((screen.getByRole('textbox', { name: /feed notes/i }) as HTMLTextAreaElement).value).toBe('')
  })

  it('should_update_feed_notes_textarea_on_change', () => {
    render(<HorseNotesForm horse={horseWithoutNotes} action={mockAction} />)
    fireEvent.change(screen.getByRole('textbox', { name: /feed notes/i }), { target: { value: '1 flake AM only' } })
    expect((screen.getByRole('textbox', { name: /feed notes/i }) as HTMLTextAreaElement).value).toBe('1 flake AM only')
  })

  it('should_update_medication_notes_textarea_on_change', () => {
    render(<HorseNotesForm horse={horseWithoutNotes} action={mockAction} />)
    fireEvent.change(screen.getByRole('textbox', { name: /medication notes/i }), { target: { value: 'Banamine PRN' } })
    expect((screen.getByRole('textbox', { name: /medication notes/i }) as HTMLTextAreaElement).value).toBe('Banamine PRN')
  })

  it('should_render_save_button', () => {
    render(<HorseNotesForm horse={horseWithoutNotes} action={mockAction} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
  })

  it('should_not_show_error_initially', () => {
    render(<HorseNotesForm horse={horseWithoutNotes} action={mockAction} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('should_display_error_message_when_action_returns_error', async () => {
    const failingAction = vi.fn().mockResolvedValue({ error: 'not_authorized' })
    render(<HorseNotesForm horse={horseWithoutNotes} action={failingAction} />)

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })

    expect(await screen.findByText('not_authorized')).toBeDefined()
  })

  it('should_show_saved_indicator_after_successful_save', async () => {
    render(<HorseNotesForm horse={horseWithoutNotes} action={mockAction} />)
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })
    expect(await screen.findByText(/saved/i)).toBeDefined()
  })

  it('should_not_show_saved_indicator_when_save_fails', async () => {
    const failingAction = vi.fn().mockResolvedValue({ error: 'not_authorized' })
    render(<HorseNotesForm horse={horseWithoutNotes} action={failingAction} />)
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })
    expect(screen.queryByText(/saved/i)).toBeNull()
  })

  // #1277 — this form carries no `key={saveCount}` remount, and doesn't need one: both of its
  // fields are controlled, so React 19's post-action form reset restores them. These guard that
  // property, so a field added here as uncontrolled goes red rather than shipping the revert.
  describe('field values survive a save', () => {
    async function save() {
      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
      })
    }

    it('should_keep_feed_notes_across_a_second_save', async () => {
      render(<HorseNotesForm horse={horseWithoutNotes} action={mockAction} />)
      fireEvent.change(screen.getByRole('textbox', { name: /feed notes/i }), { target: { value: '1 flake AM only' } })
      await save()
      fireEvent.change(screen.getByRole('textbox', { name: /feed notes/i }), { target: { value: '2 flakes hay AM/PM' } })

      await save()

      expect((screen.getByRole('textbox', { name: /feed notes/i }) as HTMLTextAreaElement).value).toBe('2 flakes hay AM/PM')
    })

    it('should_keep_medication_notes_across_a_second_save', async () => {
      render(<HorseNotesForm horse={horseWithoutNotes} action={mockAction} />)
      fireEvent.change(screen.getByRole('textbox', { name: /medication notes/i }), { target: { value: 'Banamine PRN' } })
      await save()
      fireEvent.change(screen.getByRole('textbox', { name: /medication notes/i }), { target: { value: 'Bute 1g daily' } })

      await save()

      expect((screen.getByRole('textbox', { name: /medication notes/i }) as HTMLTextAreaElement).value).toBe('Bute 1g daily')
    })
  })
})
