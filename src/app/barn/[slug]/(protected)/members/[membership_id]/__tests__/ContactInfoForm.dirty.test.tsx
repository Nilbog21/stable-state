import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { createMockProfile } from '@/test/fixtures'
import { withBlocker } from '@/test/navigation-blocker-harness'

afterEach(cleanup)

const mockRouterRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}))

import { ContactInfoForm } from '../ContactInfoForm'

const mockProfile = createMockProfile({
  is_managed: true,
  phone: '555-1234',
  emergency_contact_name: 'Bob',
  emergency_contact_phone: '555-5678',
})

describe('ContactInfoForm — navigation dirty state', () => {
  it('should_start_clean', () => {
    render(withBlocker(<ContactInfoForm profile={mockProfile} action={vi.fn()} />))
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_set_dirty_when_phone_changed', () => {
    render(withBlocker(<ContactInfoForm profile={mockProfile} action={vi.fn()} />))
    fireEvent.change(screen.getByLabelText(/^phone$/i), { target: { value: '555-9999' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  it('should_clear_dirty_after_successful_save', async () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    render(withBlocker(<ContactInfoForm profile={mockProfile} action={action} />))
    fireEvent.change(screen.getByLabelText(/^phone$/i), { target: { value: '555-9999' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_stay_dirty_after_failed_save', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'boom' })
    render(withBlocker(<ContactInfoForm profile={mockProfile} action={action} />))
    fireEvent.change(screen.getByLabelText(/^phone$/i), { target: { value: '555-9999' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
