import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { createMockProfile } from '@/test/fixtures'

afterEach(cleanup)

const mockRouterRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}))

import { ContactInfoForm } from '../ContactInfoForm'

const mockAction = vi.fn()

const mockProfile = createMockProfile({
  is_managed: true,
  phone: '555-1234',
  emergency_contact_name: 'Bob',
  emergency_contact_phone: '555-5678',
})

describe('ContactInfoForm - rendering', () => {
  it('should_render_phone_field', () => {
    render(<ContactInfoForm profile={mockProfile} action={mockAction} />)
    expect(screen.getByLabelText(/^phone$/i)).toBeDefined()
  })

  it('should_render_emergency_contact_name_field', () => {
    render(<ContactInfoForm profile={mockProfile} action={mockAction} />)
    expect(screen.getByLabelText(/emergency contact name/i)).toBeDefined()
  })

  it('should_render_emergency_contact_phone_field', () => {
    render(<ContactInfoForm profile={mockProfile} action={mockAction} />)
    expect(screen.getByLabelText(/emergency contact phone/i)).toBeDefined()
  })

  it('should_render_save_button', () => {
    render(<ContactInfoForm profile={mockProfile} action={mockAction} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
  })

  it('should_prepopulate_phone_from_profile', () => {
    render(<ContactInfoForm profile={mockProfile} action={mockAction} />)
    expect((screen.getByLabelText(/^phone$/i) as HTMLInputElement).value).toBe('555-1234')
  })

  it('should_prepopulate_emergency_contact_name_from_profile', () => {
    render(<ContactInfoForm profile={mockProfile} action={mockAction} />)
    expect((screen.getByLabelText(/emergency contact name/i) as HTMLInputElement).value).toBe('Bob')
  })

  it('should_initialize_phone_as_empty_string_when_profile_phone_is_null', () => {
    const profileWithNulls = createMockProfile({ is_managed: true, phone: null, emergency_contact_name: null, emergency_contact_phone: null })
    render(<ContactInfoForm profile={profileWithNulls} action={mockAction} />)
    expect((screen.getByLabelText(/^phone$/i) as HTMLInputElement).value).toBe('')
  })
})

describe('ContactInfoForm - submit', () => {
  beforeEach(() => {
    mockAction.mockReset()
    mockRouterRefresh.mockReset()
  })

  it('should_call_action_with_edited_field_values', async () => {
    mockAction.mockResolvedValue({ error: null })
    render(<ContactInfoForm profile={mockProfile} action={mockAction} />)
    fireEvent.change(screen.getByLabelText(/^phone$/i), { target: { value: '555-9999' } })
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(mockAction).toHaveBeenCalled())
    const formData = mockAction.mock.calls[0][0] as FormData
    expect(formData.get('phone')).toBe('555-9999')
  })

  it('should_show_error_message_when_action_returns_error', async () => {
    mockAction.mockResolvedValue({ error: 'not_authorized' })
    render(<ContactInfoForm profile={mockProfile} action={mockAction} />)
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(screen.getByText(/not_authorized/i)).toBeDefined())
  })

  it('should_call_router_refresh_on_successful_save', async () => {
    mockAction.mockResolvedValue({ error: null })
    render(<ContactInfoForm profile={mockProfile} action={mockAction} />)
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled())
  })

  it('should_not_call_router_refresh_when_action_returns_error', async () => {
    mockAction.mockResolvedValue({ error: 'not_authorized' })
    render(<ContactInfoForm profile={mockProfile} action={mockAction} />)
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(mockAction).toHaveBeenCalled())
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })
})
