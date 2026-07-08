import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExhaustionBar } from '../ExhaustionBar'

const thresholds = { high: 10, moderate: 5 }

describe('ExhaustionBar', () => {
  it('should_render_solid_segment_at_width_proportional_to_existing_total', () => {
    render(<ExhaustionBar existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 3 }]} thresholds={thresholds} />)
    expect(screen.getByTestId('exhaustion-bar-solid').style.width).toBe('30%')
  })

  it('should_render_solid_segment_green_when_existing_total_is_low_band', () => {
    render(<ExhaustionBar existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 3 }]} thresholds={thresholds} />)
    expect(screen.getByTestId('exhaustion-bar-solid').className).toContain('bg-green-500')
  })

  it('should_render_solid_segment_orange_when_existing_total_is_moderate_band', () => {
    render(<ExhaustionBar existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 7 }]} thresholds={thresholds} />)
    expect(screen.getByTestId('exhaustion-bar-solid').className).toContain('bg-orange-500')
  })

  it('should_render_solid_segment_red_when_existing_total_is_high_band', () => {
    render(<ExhaustionBar existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 11 }]} thresholds={thresholds} />)
    expect(screen.getByTestId('exhaustion-bar-solid').className).toContain('bg-red-500')
  })

  it('should_shift_solid_band_when_ghost_value_pushes_total_into_higher_band', () => {
    render(
      <ExhaustionBar
        existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 3 }]}
        ghostValue={5}
        thresholds={thresholds}
      />
    )
    expect(screen.getByTestId('exhaustion-bar-solid').className).toContain('bg-orange-500')
  })

  it('should_not_render_ghost_segment_when_ghost_value_omitted', () => {
    render(<ExhaustionBar existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 3 }]} thresholds={thresholds} />)
    expect(screen.queryByTestId('exhaustion-bar-ghost')).toBeNull()
  })

  it('should_not_render_ghost_segment_when_ghost_value_is_zero', () => {
    render(
      <ExhaustionBar
        existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 3 }]}
        ghostValue={0}
        thresholds={thresholds}
      />
    )
    expect(screen.queryByTestId('exhaustion-bar-ghost')).toBeNull()
  })

  it('should_render_ghost_segment_at_correct_width_when_provided', () => {
    render(
      <ExhaustionBar
        existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 3 }]}
        ghostValue={2}
        thresholds={thresholds}
      />
    )
    expect(screen.getByTestId('exhaustion-bar-ghost').style.width).toBe('20%')
  })

  it('should_render_ghost_segment_neutral_colored_when_not_overflowing', () => {
    render(
      <ExhaustionBar
        existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 3 }]}
        ghostValue={2}
        thresholds={thresholds}
      />
    )
    expect(screen.getByTestId('exhaustion-bar-ghost').className).toContain('bg-zinc-400')
  })

  it('should_render_ghost_segment_red_when_combined_total_exceeds_high_threshold', () => {
    render(
      <ExhaustionBar
        existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 8 }]}
        ghostValue={5}
        thresholds={thresholds}
      />
    )
    expect(screen.getByTestId('exhaustion-bar-ghost').className).toContain('bg-red-500')
  })

  it('should_clip_solid_segment_at_100_percent_when_existing_total_exceeds_high_threshold', () => {
    render(<ExhaustionBar existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 15 }]} thresholds={thresholds} />)
    expect(screen.getByTestId('exhaustion-bar-solid').style.width).toBe('100%')
  })

  it('should_not_produce_nan_width_when_high_threshold_is_zero', () => {
    render(
      <ExhaustionBar
        existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 1 }]}
        thresholds={{ high: 0, moderate: 0 }}
      />
    )
    expect(screen.getByTestId('exhaustion-bar-solid').style.width).toBe('100%')
  })

  it('should_still_render_ghost_segment_when_existing_total_already_exceeds_high_threshold', () => {
    render(
      <ExhaustionBar
        existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 15 }]}
        ghostValue={5}
        thresholds={thresholds}
      />
    )
    expect(screen.getByTestId('exhaustion-bar-ghost').style.width).toBe('8%')
    expect(screen.getByTestId('exhaustion-bar-solid').style.width).toBe('92%')
  })

  it('should_open_expansion_panel_on_bar_tap', () => {
    render(<ExhaustionBar existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 3 }]} thresholds={thresholds} />)
    fireEvent.click(screen.getByRole('button', { name: /exhaustion/i }))
    expect(screen.getByText('3 points from 1 lessons (±3-day window)')).toBeDefined()
  })

  it('should_list_one_row_per_existing_row_in_expansion', () => {
    render(
      <ExhaustionBar
        existingRows={[
          { lessonAt: '2026-07-01', exertionLevel: 3 },
          { lessonAt: '2026-07-02', exertionLevel: 4 },
        ]}
        thresholds={thresholds}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /exhaustion/i }))
    expect(screen.getAllByTestId('exhaustion-bar-row')).toHaveLength(2)
  })

  it('should_dismiss_expansion_on_close_button', () => {
    render(<ExhaustionBar existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 3 }]} thresholds={thresholds} />)
    fireEvent.click(screen.getByRole('button', { name: /exhaustion/i }))
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText('3 points from 1 lessons (±3-day window)')).toBeNull()
  })

  it('should_render_no_lessons_message_when_existing_rows_is_empty', () => {
    render(<ExhaustionBar existingRows={[]} thresholds={thresholds} />)
    fireEvent.click(screen.getByRole('button', { name: /exhaustion/i }))
    expect(screen.getByText('No lessons in window')).toBeDefined()
  })

  it('should_dismiss_expansion_on_outside_click', () => {
    render(
      <div>
        <ExhaustionBar existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 3 }]} thresholds={thresholds} />
        <div data-testid="outside">outside</div>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /exhaustion/i }))
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('3 points from 1 lessons (±3-day window)')).toBeNull()
  })

  it('should_prevent_default_when_toggle_button_clicked', () => {
    render(
      <a href="/elsewhere">
        <ExhaustionBar existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 3 }]} thresholds={thresholds} />
      </a>
    )
    const notPrevented = fireEvent.click(screen.getByRole('button', { name: /exhaustion/i }))
    expect(notPrevented).toBe(false)
  })

  it('should_stop_propagation_when_toggle_button_clicked', () => {
    const outerClick = vi.fn()
    render(
      <a href="/elsewhere" onClick={outerClick}>
        <ExhaustionBar existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 3 }]} thresholds={thresholds} />
      </a>
    )
    fireEvent.click(screen.getByRole('button', { name: /exhaustion/i }))
    expect(outerClick).not.toHaveBeenCalled()
  })

  it('should_prevent_default_when_close_button_clicked', () => {
    render(
      <a href="/elsewhere">
        <ExhaustionBar existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 3 }]} thresholds={thresholds} />
      </a>
    )
    fireEvent.click(screen.getByRole('button', { name: /exhaustion/i }))
    const notPrevented = fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(notPrevented).toBe(false)
  })

  it('should_stop_propagation_when_close_button_clicked', () => {
    const outerClick = vi.fn()
    render(
      <a href="/elsewhere" onClick={outerClick}>
        <ExhaustionBar existingRows={[{ lessonAt: '2026-07-01', exertionLevel: 3 }]} thresholds={thresholds} />
      </a>
    )
    fireEvent.click(screen.getByRole('button', { name: /exhaustion/i }))
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(outerClick).not.toHaveBeenCalled()
  })
})
