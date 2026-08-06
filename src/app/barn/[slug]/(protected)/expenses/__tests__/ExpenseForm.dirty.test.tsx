import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { withBlocker } from '@/test/navigation-blocker-harness'
import { calendarDate } from '@/lib/local-day'

vi.mock('@/app/actions/expenses', () => ({
  getMostCommonExpenseTypeAction: vi.fn(),
}))

import { getMostCommonExpenseTypeAction } from '@/app/actions/expenses'
import { ExpenseForm } from '../ExpenseForm'

afterEach(cleanup)
beforeEach(() => {
  vi.mocked(getMostCommonExpenseTypeAction).mockReset()
  vi.mocked(getMostCommonExpenseTypeAction).mockResolvedValue(null)
})

const onSave = vi.fn().mockResolvedValue({ error: null })

function renderForm() {
  return render(
    withBlocker(
      <ExpenseForm
        barnSlug="green-acres"
        horses={[{ id: 'horse-1', name: 'Apple' }]}
        recentRecipients={[]}
        recentExpenseTypes={[]}
        defaultDate={calendarDate('2026-07-04')}
        todayStr={calendarDate('2026-07-04')}
        timezone="America/New_York"
        onSave={onSave}
        getScheduleRange={async () => []}
      />
    )
  )
}

describe('ExpenseForm — navigation dirty state', () => {
  it('should_start_clean', () => {
    renderForm()
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_set_dirty_when_recipient_changed', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/recipient/i), { target: { value: 'Dr. Hoof' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  it('should_set_dirty_when_calendar_day_tapped', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: '2026-07-10' }))
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
