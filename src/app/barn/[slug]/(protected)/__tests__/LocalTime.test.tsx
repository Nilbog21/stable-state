import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LocalTime } from '../LocalTime'

describe('LocalTime', () => {
  it('should_render_a_non_empty_string_for_a_valid_iso_date', () => {
    render(<LocalTime iso="2026-06-22T14:00:00.000Z" />)
    expect(document.body.textContent).not.toBe('')
  })

  it('should_render_different_output_for_different_iso_dates', () => {
    const { unmount } = render(<LocalTime iso="2026-06-22T14:00:00.000Z" />)
    const first = document.body.textContent
    unmount()
    render(<LocalTime iso="2026-06-23T09:30:00.000Z" />)
    const second = document.body.textContent
    expect(first).not.toBe(second)
  })
})
