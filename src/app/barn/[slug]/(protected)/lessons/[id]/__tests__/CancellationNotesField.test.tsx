import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

afterEach(cleanup)

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

vi.mock('@/app/actions/lessons', () => ({
  updateCancellationNotesAction: vi.fn(),
}))

import { useRouter } from 'next/navigation'
import { updateCancellationNotesAction } from '@/app/actions/lessons'
import { CancellationNotesField } from '../CancellationNotesField'

beforeEach(() => {
  vi.mocked(updateCancellationNotesAction).mockReset()
  vi.mocked(updateCancellationNotesAction).mockResolvedValue({ error: null })
  vi.mocked(useRouter).mockReset()
  vi.mocked(useRouter).mockReturnValue({ refresh: vi.fn() } as any)
})

describe('CancellationNotesField', () => {
  it('should_render_textarea_with_initial_value', () => {
    render(<CancellationNotesField barnSlug="green-acres" lessonId="lesson-1" initialNotes="rider was sick" />)
    expect(screen.getByDisplayValue('rider was sick')).toBeDefined()
  })

  it('should_render_empty_textarea_when_initial_notes_is_null', () => {
    render(<CancellationNotesField barnSlug="green-acres" lessonId="lesson-1" initialNotes={null} />)
    expect(screen.getByRole('textbox')).toHaveProperty('value', '')
  })

  it('should_call_updateCancellationNotesAction_on_blur_when_changed', async () => {
    render(<CancellationNotesField barnSlug="green-acres" lessonId="lesson-1" initialNotes="rider was sick" />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'updated reason' } })
    await act(async () => {
      fireEvent.blur(textarea)
    })
    expect(updateCancellationNotesAction).toHaveBeenCalledWith('lesson-1', 'green-acres', 'updated reason')
  })

  it('should_not_call_updateCancellationNotesAction_on_blur_when_unchanged', async () => {
    render(<CancellationNotesField barnSlug="green-acres" lessonId="lesson-1" initialNotes="rider was sick" />)
    const textarea = screen.getByRole('textbox')
    await act(async () => {
      fireEvent.blur(textarea)
    })
    expect(updateCancellationNotesAction).not.toHaveBeenCalled()
  })

  it('should_call_router_refresh_after_successful_save', async () => {
    const mockRefresh = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ refresh: mockRefresh } as any)
    render(<CancellationNotesField barnSlug="green-acres" lessonId="lesson-1" initialNotes="rider was sick" />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'updated reason' } })
    await act(async () => {
      fireEvent.blur(textarea)
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('should_show_error_message_when_action_returns_error', async () => {
    vi.mocked(updateCancellationNotesAction).mockResolvedValue({ error: 'Failed to update cancellation notes' })
    render(<CancellationNotesField barnSlug="green-acres" lessonId="lesson-1" initialNotes="rider was sick" />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'updated reason' } })
    await act(async () => {
      fireEvent.blur(textarea)
    })
    expect(screen.getByText('Failed to update cancellation notes')).toBeDefined()
  })

  it('should_revert_textarea_to_initial_value_when_action_returns_error', async () => {
    vi.mocked(updateCancellationNotesAction).mockResolvedValue({ error: 'Failed to update cancellation notes' })
    render(<CancellationNotesField barnSlug="green-acres" lessonId="lesson-1" initialNotes="rider was sick" />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'updated reason' } })
    await act(async () => {
      fireEvent.blur(textarea)
    })
    expect(screen.getByDisplayValue('rider was sick')).toBeDefined()
  })

  it('should_not_call_updateCancellationNotesAction_on_blur_when_unchanged_and_initial_notes_is_null', async () => {
    render(<CancellationNotesField barnSlug="green-acres" lessonId="lesson-1" initialNotes={null} />)
    const textarea = screen.getByRole('textbox')
    await act(async () => {
      fireEvent.blur(textarea)
    })
    expect(updateCancellationNotesAction).not.toHaveBeenCalled()
  })

  it('should_revert_textarea_to_empty_string_when_initial_notes_is_null_and_action_returns_error', async () => {
    vi.mocked(updateCancellationNotesAction).mockResolvedValue({ error: 'Failed to update cancellation notes' })
    render(<CancellationNotesField barnSlug="green-acres" lessonId="lesson-1" initialNotes={null} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'updated reason' } })
    await act(async () => {
      fireEvent.blur(textarea)
    })
    expect(screen.getByRole('textbox')).toHaveProperty('value', '')
  })

  it('should_not_call_router_refresh_when_action_returns_error', async () => {
    vi.mocked(updateCancellationNotesAction).mockResolvedValue({ error: 'Failed to update cancellation notes' })
    const mockRefresh = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ refresh: mockRefresh } as any)
    render(<CancellationNotesField barnSlug="green-acres" lessonId="lesson-1" initialNotes="rider was sick" />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'updated reason' } })
    await act(async () => {
      fireEvent.blur(textarea)
    })
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
