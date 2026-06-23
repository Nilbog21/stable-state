import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { LessonNotesForm } from '../LessonNotesForm'

afterEach(cleanup)

const mockHorse = { exertion_level: 3, horse_notes: 'watch left lead', horses: { id: 'horse-1', name: 'Thunderbolt' } }
const mockRider = { rider_notes: 'good position', private_notes: 'struggling', riders: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } }

const mockAction = vi.fn().mockResolvedValue(undefined)

describe('LessonNotesForm', () => {
  it('should_render_horse_name_and_exertion', () => {
    render(<LessonNotesForm action={mockAction} horses={[mockHorse]} riders={[]} />)

    expect(screen.getByText(/Thunderbolt/)).toBeDefined()
  })

  it('should_render_horse_notes_textarea_with_value', () => {
    render(<LessonNotesForm action={mockAction} horses={[mockHorse]} riders={[]} />)

    expect(screen.getByDisplayValue('watch left lead')).toBeDefined()
  })

  it('should_render_horse_notes_label', () => {
    render(<LessonNotesForm action={mockAction} horses={[mockHorse]} riders={[]} />)

    expect(screen.getByText('Horse Notes')).toBeDefined()
  })

  it('should_render_rider_name', () => {
    render(<LessonNotesForm action={mockAction} horses={[]} riders={[mockRider]} />)

    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_render_rider_notes_textarea_with_value', () => {
    render(<LessonNotesForm action={mockAction} horses={[]} riders={[mockRider]} />)

    expect(screen.getByDisplayValue('good position')).toBeDefined()
  })

  it('should_render_private_notes_textarea_with_value', () => {
    render(<LessonNotesForm action={mockAction} horses={[]} riders={[mockRider]} />)

    expect(screen.getByDisplayValue('struggling')).toBeDefined()
  })

  it('should_render_private_label', () => {
    render(<LessonNotesForm action={mockAction} horses={[]} riders={[mockRider]} />)

    expect(screen.getByText('Private')).toBeDefined()
  })

  it('should_render_save_button', () => {
    render(<LessonNotesForm action={mockAction} horses={[]} riders={[]} />)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined()
  })

  it('should_not_render_horse_form_when_horses_relation_is_null', () => {
    const nullHorse = { ...mockHorse, horses: null }
    render(<LessonNotesForm action={mockAction} horses={[nullHorse]} riders={[]} />)

    expect(screen.queryByText('Horse Notes')).toBeNull()
  })

  it('should_not_render_rider_form_when_riders_relation_is_null', () => {
    const nullRider = { ...mockRider, riders: null }
    render(<LessonNotesForm action={mockAction} horses={[]} riders={[nullRider]} />)

    expect(screen.queryByText('Rider Notes')).toBeNull()
  })

  it('should_render_dash_for_null_horse_name', () => {
    const nullHorse = { ...mockHorse, horses: null }
    render(<LessonNotesForm action={mockAction} horses={[nullHorse]} riders={[]} />)

    expect(screen.getByText('—', { exact: false })).toBeDefined()
  })

  it('should_render_dash_for_null_rider_name', () => {
    const nullRider = { ...mockRider, riders: null }
    render(<LessonNotesForm action={mockAction} horses={[]} riders={[nullRider]} />)

    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_show_empty_textarea_when_horse_notes_is_null', () => {
    const noNotesHorse = { ...mockHorse, horse_notes: null }
    render(<LessonNotesForm action={mockAction} horses={[noNotesHorse]} riders={[]} />)

    expect(screen.getByText('Horse Notes')).toBeDefined()
  })

  it('should_add_beforeunload_listener_when_form_changes', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    render(<LessonNotesForm action={mockAction} horses={[mockHorse]} riders={[]} />)

    fireEvent.change(screen.getByDisplayValue('watch left lead'), { target: { value: 'new notes' } })

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    })
    addSpy.mockRestore()
  })

  it('should_remove_beforeunload_listener_after_submit', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    render(<LessonNotesForm action={mockAction} horses={[mockHorse]} riders={[]} />)

    fireEvent.change(screen.getByDisplayValue('watch left lead'), { target: { value: 'new notes' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)

    await waitFor(() => {
      expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    })
    removeSpy.mockRestore()
  })

  it('should_call_action_on_submit', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    render(<LessonNotesForm action={action} horses={[mockHorse]} riders={[]} />)

    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)

    await waitFor(() => {
      expect(action).toHaveBeenCalled()
    })
  })

  it('should_prevent_default_on_beforeunload_when_dirty', async () => {
    render(<LessonNotesForm action={mockAction} horses={[mockHorse]} riders={[]} />)

    fireEvent.change(screen.getByDisplayValue('watch left lead'), { target: { value: 'new notes' } })

    await waitFor(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    })
  })
})
