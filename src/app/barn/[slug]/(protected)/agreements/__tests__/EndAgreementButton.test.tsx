import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EndAgreementButton } from '../EndAgreementButton'

describe('EndAgreementButton', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should_render_end_agreement_button', () => {
    render(<EndAgreementButton action={vi.fn() as unknown as () => Promise<void>} />)
    expect(screen.getByRole('button', { name: /end agreement/i })).toBeDefined()
  })

  it('should_call_window_confirm_when_clicked', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<EndAgreementButton action={vi.fn() as unknown as () => Promise<void>} />)
    fireEvent.click(screen.getByRole('button', { name: /end agreement/i }))
    expect(window.confirm).toHaveBeenCalledOnce()
  })
})
