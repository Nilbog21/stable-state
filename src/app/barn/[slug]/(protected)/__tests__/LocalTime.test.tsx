import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LocalTime } from '../LocalTime'

describe('LocalTime', () => {
  it('should_render_a_non_empty_string_after_mount', () => {
    const { container } = render(<LocalTime iso="2026-06-22T14:00:00.000Z" />)
    expect(container.textContent).not.toBe('')
  })

  it('should_render_output_of_to_locale_string', () => {
    const iso = '2026-06-22T14:00:00.000Z'
    const { container } = render(<LocalTime iso={iso} />)
    expect(container.textContent).toBe(new Date(iso).toLocaleString())
  })

  it('should_render_different_output_for_different_iso_dates', () => {
    const { container: c1 } = render(<LocalTime iso="2026-06-22T14:00:00.000Z" />)
    const { container: c2 } = render(<LocalTime iso="2026-06-23T09:30:00.000Z" />)
    expect(c1.textContent).not.toBe(c2.textContent)
  })
})
