import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockBarnEvent } from '@/test/fixtures'
import { EventForm } from '../EventForm'

afterEach(() => vi.restoreAllMocks())

const mockAction = vi.fn().mockResolvedValue({ error: null })

describe('EventForm — new mode', () => {
  it('should_render_title_field', () => {
    render(<EventForm timezone={'America/New_York'} mode="new" action={mockAction} />)

    expect(screen.getByLabelText(/title/i)).toBeDefined()
  })

  it('should_update_title_value_on_change', () => {
    render(<EventForm timezone={'America/New_York'} mode="new" action={mockAction} />)

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Costume Party' } })

    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe('Costume Party')
  })

  it('should_render_date_picker', () => {
    render(<EventForm timezone={'America/New_York'} mode="new" action={mockAction} />)

    expect(screen.getByLabelText(/^date$/i)).toBeDefined()
  })

  it('should_render_notes_field', () => {
    render(<EventForm timezone={'America/New_York'} mode="new" action={mockAction} />)

    expect(screen.getByLabelText(/notes/i)).toBeDefined()
  })

  it('should_render_a_checkbox_for_each_role', () => {
    render(<EventForm timezone={'America/New_York'} mode="new" action={mockAction} />)

    expect(screen.getByLabelText(/^manager$/i)).toBeDefined()
    expect(screen.getByLabelText(/^trainer$/i)).toBeDefined()
    expect(screen.getByLabelText(/^rider$/i)).toBeDefined()
  })

  it('should_default_all_role_checkboxes_to_checked', () => {
    render(<EventForm timezone={'America/New_York'} mode="new" action={mockAction} />)

    expect((screen.getByLabelText(/^manager$/i) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/^trainer$/i) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/^rider$/i) as HTMLInputElement).checked).toBe(true)
  })

  it('should_render_save_button', () => {
    render(<EventForm timezone={'America/New_York'} mode="new" action={mockAction} />)

    expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
  })

  it('should_not_render_delete_link_in_new_mode', () => {
    render(<EventForm timezone={'America/New_York'} mode="new" action={mockAction} />)

    expect(screen.queryByRole('link', { name: /delete/i })).toBeNull()
  })

  it('should_display_error_message_when_action_returns_error', async () => {
    const failingAction = vi.fn().mockResolvedValue({ error: 'Title is required' })
    render(<EventForm timezone={'America/New_York'} mode="new" action={failingAction} />)

    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

    expect(await screen.findByText('Title is required')).toBeDefined()
  })

  it('should_not_show_error_before_submission', () => {
    render(<EventForm timezone={'America/New_York'} mode="new" action={mockAction} />)

    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('EventForm — edit mode', () => {
  const event = createMockBarnEvent({
    id: 'event-1',
    title: 'Costume Party',
    notes: 'Bring candy',
    visible_to_roles: ['manager', 'rider'],
  })

  it('should_render_title_field_with_initial_value', () => {
    render(<EventForm timezone={'America/New_York'} mode="edit" initialEvent={event} action={mockAction} deleteHref="/delete" />)

    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe('Costume Party')
  })

  it('should_render_notes_field_with_initial_value', () => {
    render(<EventForm timezone={'America/New_York'} mode="edit" initialEvent={event} action={mockAction} deleteHref="/delete" />)

    expect((screen.getByLabelText(/notes/i) as HTMLTextAreaElement).value).toBe('Bring candy')
  })

  it('should_check_only_roles_present_in_visible_to_roles', () => {
    render(<EventForm timezone={'America/New_York'} mode="edit" initialEvent={event} action={mockAction} deleteHref="/delete" />)

    expect((screen.getByLabelText(/^manager$/i) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/^trainer$/i) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByLabelText(/^rider$/i) as HTMLInputElement).checked).toBe(true)
  })

  it('should_render_delete_link_in_edit_mode', () => {
    render(<EventForm timezone={'America/New_York'} mode="edit" initialEvent={event} action={mockAction} deleteHref="/delete" />)

    expect(screen.getByRole('link', { name: /delete/i })).toBeDefined()
  })

  it('should_point_delete_link_at_deleteHref', () => {
    render(<EventForm timezone={'America/New_York'} mode="edit" initialEvent={event} action={mockAction} deleteHref="/delete" />)

    expect(screen.getByRole('link', { name: /delete/i }).getAttribute('href')).toBe('/delete')
  })
})
