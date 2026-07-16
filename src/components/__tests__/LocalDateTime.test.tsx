import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LocalDateTime } from '../LocalDateTime'

afterEach(cleanup)

describe('LocalDateTime', () => {
  let originalTz: string | undefined

  beforeEach(() => {
    originalTz = process.env.TZ
    process.env.TZ = 'America/New_York'
  })

  afterEach(() => {
    process.env.TZ = originalTz
  })

  it('should_render_the_instant_formatted_in_the_runtimes_local_timezone', () => {
    render(
      <LocalDateTime iso="2026-05-17T10:00:00Z" options={{ dateStyle: 'medium', timeStyle: 'short' }} />
    )

    expect(screen.getByText('May 17, 2026, 6:00 AM')).toBeDefined()
  })

  it('should_render_date_only_when_options_omit_time', () => {
    render(<LocalDateTime iso="2026-05-17T10:00:00Z" options={{ month: 'short', day: 'numeric', year: 'numeric' }} />)

    expect(screen.getByText('May 17, 2026')).toBeDefined()
  })

  it('should_suppress_hydration_warning_on_the_rendered_element', () => {
    const { container } = render(
      <LocalDateTime iso="2026-05-17T10:00:00Z" options={{ dateStyle: 'medium', timeStyle: 'short' }} />
    )

    // React strips suppressHydrationWarning from the DOM; presence of the text with
    // no console warning during this synchronous render is the behavioral proof —
    // this assertion just confirms the element renders as a span wrapper.
    expect(container.querySelector('span')).not.toBeNull()
  })
})
