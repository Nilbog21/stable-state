import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { createMockProfile } from '@/test/fixtures'

afterEach(cleanup)

const mockRouterPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('../actions', () => ({
  updateProfileAction: vi.fn(),
}))

import { updateProfileAction } from '../actions'
import { ProfileForm } from '../ProfileForm'

const mockProfile = createMockProfile({
  first_name: 'Jane',
  last_name: 'Doe',
  phone: '555-1234',
  emergency_contact_name: 'Bob',
  emergency_contact_phone: '555-5678',
})

describe('ProfileForm - rendering', () => {
  it('should_render_heading', () => {
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    expect(screen.getByRole('heading', { name: /edit profile/i })).toBeDefined()
  })

  it('should_render_first_name_field', () => {
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    expect(screen.getByLabelText(/first name/i)).toBeDefined()
  })

  it('should_render_last_name_field', () => {
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    expect(screen.getByLabelText(/last name/i)).toBeDefined()
  })

  it('should_render_phone_field', () => {
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    expect(screen.getByLabelText(/^phone$/i)).toBeDefined()
  })

  it('should_render_emergency_contact_name_field', () => {
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    expect(screen.getByLabelText(/emergency contact name/i)).toBeDefined()
  })

  it('should_render_emergency_contact_phone_field', () => {
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    expect(screen.getByLabelText(/emergency contact phone/i)).toBeDefined()
  })

  it('should_prepopulate_first_name_from_profile', () => {
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe('Jane')
  })

  it('should_prepopulate_last_name_from_profile', () => {
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    expect((screen.getByLabelText(/last name/i) as HTMLInputElement).value).toBe('Doe')
  })
})

describe('ProfileForm - client validation', () => {
  it('should_not_submit_when_first_name_is_blank', async () => {
    vi.mocked(updateProfileAction).mockResolvedValue({ error: null })
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    const input = screen.getByLabelText(/first name/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(updateProfileAction).not.toHaveBeenCalled())
  })

  it('should_not_submit_when_last_name_is_blank', async () => {
    vi.mocked(updateProfileAction).mockResolvedValue({ error: null })
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    const input = screen.getByLabelText(/last name/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(updateProfileAction).not.toHaveBeenCalled())
  })
})

describe('ProfileForm - name change confirmation', () => {
  beforeEach(() => {
    vi.mocked(updateProfileAction).mockReset()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
  })

  it('should_prompt_confirm_when_first_name_changes', async () => {
    vi.mocked(updateProfileAction).mockResolvedValue({ error: null })
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Janet' } })
    fireEvent.submit(screen.getByRole('form'))
    expect(window.confirm).toHaveBeenCalled()
  })

  it('should_prompt_confirm_when_last_name_changes', async () => {
    vi.mocked(updateProfileAction).mockResolvedValue({ error: null })
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Smith' } })
    fireEvent.submit(screen.getByRole('form'))
    expect(window.confirm).toHaveBeenCalled()
  })

  it('should_not_prompt_confirm_when_only_contact_fields_change', async () => {
    vi.mocked(updateProfileAction).mockResolvedValue({ error: null })
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    fireEvent.change(screen.getByLabelText(/^phone$/i), { target: { value: '555-9999' } })
    fireEvent.submit(screen.getByRole('form'))
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('should_not_submit_when_confirm_is_cancelled', async () => {
    vi.mocked(updateProfileAction).mockResolvedValue({ error: null })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Janet' } })
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(updateProfileAction).not.toHaveBeenCalled())
  })

  it('should_call_action_when_name_change_is_confirmed', async () => {
    vi.mocked(updateProfileAction).mockResolvedValue({ error: null })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Janet' } })
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(updateProfileAction).toHaveBeenCalled())
  })
})

describe('ProfileForm - null contact fields', () => {
  it('should_initialize_phone_as_empty_string_when_profile_phone_is_null', () => {
    const profileWithNulls = createMockProfile({ phone: null, emergency_contact_name: null, emergency_contact_phone: null })
    render(<ProfileForm profile={profileWithNulls} heading="Edit Profile" redirectAfterSave={null} />)
    expect((screen.getByLabelText(/^phone$/i) as HTMLInputElement).value).toBe('')
  })

  it('should_initialize_emergency_contact_name_as_empty_string_when_null', () => {
    const profileWithNulls = createMockProfile({ phone: null, emergency_contact_name: null, emergency_contact_phone: null })
    render(<ProfileForm profile={profileWithNulls} heading="Edit Profile" redirectAfterSave={null} />)
    expect((screen.getByLabelText(/emergency contact name/i) as HTMLInputElement).value).toBe('')
  })

  it('should_initialize_emergency_contact_phone_as_empty_string_when_null', () => {
    const profileWithNulls = createMockProfile({ phone: null, emergency_contact_name: null, emergency_contact_phone: null })
    render(<ProfileForm profile={profileWithNulls} heading="Edit Profile" redirectAfterSave={null} />)
    expect((screen.getByLabelText(/emergency contact phone/i) as HTMLInputElement).value).toBe('')
  })

  it('should_update_emergency_contact_name_when_changed', () => {
    const profileWithNulls = createMockProfile({ phone: null, emergency_contact_name: null, emergency_contact_phone: null })
    render(<ProfileForm profile={profileWithNulls} heading="Edit Profile" redirectAfterSave={null} />)
    fireEvent.change(screen.getByLabelText(/emergency contact name/i), { target: { value: 'Alice' } })
    expect((screen.getByLabelText(/emergency contact name/i) as HTMLInputElement).value).toBe('Alice')
  })

  it('should_update_emergency_contact_phone_when_changed', () => {
    const profileWithNulls = createMockProfile({ phone: null, emergency_contact_name: null, emergency_contact_phone: null })
    render(<ProfileForm profile={profileWithNulls} heading="Edit Profile" redirectAfterSave={null} />)
    fireEvent.change(screen.getByLabelText(/emergency contact phone/i), { target: { value: '555-9999' } })
    expect((screen.getByLabelText(/emergency contact phone/i) as HTMLInputElement).value).toBe('555-9999')
  })
})

describe('ProfileForm - after save', () => {
  beforeEach(() => {
    vi.mocked(updateProfileAction).mockReset()
    mockRouterPush.mockReset()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('should_redirect_after_save_when_redirectAfterSave_is_set', async () => {
    vi.mocked(updateProfileAction).mockResolvedValue({ error: null })
    render(<ProfileForm profile={mockProfile} heading="Complete your profile" redirectAfterSave="/" />)
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/'))
  })

  it('should_call_updateProfileAction_when_redirectAfterSave_is_null', async () => {
    vi.mocked(updateProfileAction).mockResolvedValue({ error: null })
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(updateProfileAction).toHaveBeenCalled())
  })

  it('should_not_call_router_push_when_redirectAfterSave_is_null', async () => {
    vi.mocked(updateProfileAction).mockResolvedValue({ error: null })
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(updateProfileAction).toHaveBeenCalled())
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('should_show_error_message_when_action_returns_error', async () => {
    vi.mocked(updateProfileAction).mockResolvedValue({ error: 'Failed to update profile' })
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(screen.getByText(/failed to update profile/i)).toBeDefined())
  })

  it('should_show_success_message_after_save_when_redirectAfterSave_is_null', async () => {
    vi.mocked(updateProfileAction).mockResolvedValue({ error: null })
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(screen.getByText(/profile saved/i)).toBeDefined())
  })

  it('should_clear_success_message_when_field_is_edited_after_save', async () => {
    vi.mocked(updateProfileAction).mockResolvedValue({ error: null })
    render(<ProfileForm profile={mockProfile} heading="Edit Profile" redirectAfterSave={null} />)
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(screen.getByText(/profile saved/i)).toBeDefined())
    fireEvent.change(screen.getByLabelText(/^phone$/i), { target: { value: '555-0000' } })
    expect(screen.queryByText(/profile saved/i)).toBeNull()
  })
})
