import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TierForm } from '../TierForm'
import { withBlocker } from '@/test/navigation-blocker-harness'

afterEach(cleanup)

const mockAction = vi.fn().mockResolvedValue({ error: null })

describe('TierForm — navigation dirty state', () => {
  it('should_start_clean', () => {
    render(withBlocker(<TierForm mode="new" action={mockAction} />))
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_set_dirty_when_name_changed', () => {
    render(withBlocker(<TierForm mode="new" action={mockAction} />))
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Premium' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
