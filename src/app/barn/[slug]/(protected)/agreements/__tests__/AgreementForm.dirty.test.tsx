import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AgreementForm } from '../AgreementForm'
import { withBlocker } from '@/test/navigation-blocker-harness'

afterEach(cleanup)

const riders = [{ id: 'rider-1', name: 'Dana Rider' }]
const horses = [{ id: 'horse-1', name: 'Apple' }]
const onSave = vi.fn().mockResolvedValue({ error: null })

describe('AgreementForm — navigation dirty state', () => {
  it('should_start_clean', () => {
    render(withBlocker(<AgreementForm mode="new" kind="lease" riders={riders} horses={horses} onSave={onSave} />))
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_set_dirty_when_fee_changed', () => {
    render(withBlocker(<AgreementForm mode="new" kind="lease" riders={riders} horses={horses} onSave={onSave} />))
    fireEvent.change(screen.getByLabelText(/fee/i), { target: { value: '250' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  it('should_set_dirty_when_rider_selected', () => {
    render(withBlocker(<AgreementForm mode="new" kind="lease" riders={riders} horses={horses} onSave={onSave} />))
    fireEvent.change(document.getElementById('agreement-rider')!, { target: { value: 'rider-1' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
