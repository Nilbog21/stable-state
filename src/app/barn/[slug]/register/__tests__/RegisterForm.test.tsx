import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { useActionState } from 'react'

afterEach(cleanup)

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useActionState: vi.fn() }
})

import { RegisterForm } from '../RegisterForm'

const mockAction = vi.fn()

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useActionState).mockReturnValue([null, mockAction, false] as any)
  })

  it('should_render_first_name_input_with_default_value', () => {
    render(<RegisterForm defaultFirstName="Jane" defaultLast="Doe" action={mockAction as any} />)
    const input = screen.getByLabelText(/first name/i) as HTMLInputElement
    expect(input.defaultValue).toBe('Jane')
  })

  it('should_render_last_name_input_with_default_value', () => {
    render(<RegisterForm defaultFirstName="Jane" defaultLast="Doe" action={mockAction as any} />)
    const input = screen.getByLabelText(/last name/i) as HTMLInputElement
    expect(input.defaultValue).toBe('Doe')
  })

  it('should_render_trainer_and_rider_role_radio_buttons', () => {
    render(<RegisterForm defaultFirstName="Jane" defaultLast="Doe" action={mockAction as any} />)
    expect(screen.getByRole('radio', { name: /trainer/i })).toBeDefined()
    expect(screen.getByRole('radio', { name: /rider/i })).toBeDefined()
  })

  it('should_render_request_access_submit_button', () => {
    render(<RegisterForm defaultFirstName="Jane" defaultLast="Doe" action={mockAction as any} />)
    expect(screen.getByRole('button', { name: /request access/i })).toBeDefined()
  })

  it('should_display_error_message_when_state_has_error', () => {
    vi.mocked(useActionState).mockReturnValue([{ error: 'First name is required.' }, mockAction, false] as any)
    render(<RegisterForm defaultFirstName="" defaultLast="Doe" action={mockAction as any} />)
    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.getByText('First name is required.')).toBeDefined()
  })

  it('should_show_requesting_text_when_form_is_pending', () => {
    vi.mocked(useActionState).mockReturnValue([null, mockAction, true] as any)
    render(<RegisterForm defaultFirstName="Jane" defaultLast="Doe" action={mockAction as any} />)
    expect(screen.getByRole('button', { name: /requesting/i })).toBeDefined()
  })
})
