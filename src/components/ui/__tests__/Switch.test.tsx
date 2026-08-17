import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Switch, switchKnobClasses, switchTrackClasses } from '../Switch'
import { PAGE, bgColors, contrast } from '@/test/tailwind-contrast'

/** The knob, reached through the decorative track it sits inside. */
function knob(): HTMLElement {
  const el = screen.getByRole('switch').querySelector('[aria-hidden] > span')
  if (!(el instanceof HTMLElement)) throw new Error('no knob inside the switch')
  return el
}

describe('Switch', () => {
  describe('state', () => {
    it('should_expose_the_switch_role', () => {
      render(<Switch checked={false} label="Lesson schedule access" />)
      expect(screen.getByRole('switch')).toBeDefined()
    })

    it('should_report_checked_through_aria_checked', () => {
      render(<Switch checked label="Lesson schedule access" />)
      expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
    })

    it('should_report_unchecked_through_aria_checked', () => {
      render(<Switch checked={false} label="Lesson schedule access" />)
      expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    })

    it('should_name_itself_from_the_label_prop', () => {
      render(<Switch checked={false} label="Lesson schedule access for Emery Rider" />)
      expect(screen.getByRole('switch', { name: 'Lesson schedule access for Emery Rider' })).toBeDefined()
    })

    // The track and knob are decoration -- the state a screen reader needs is on the button, and
    // announcing the fill a second time is worse than not announcing it at all.
    it('should_hide_the_track_from_assistive_tech', () => {
      render(<Switch checked={false} label="Lesson schedule access" />)
      expect(screen.getByRole('switch').querySelector('[aria-hidden]')).not.toBeNull()
    })
  })

  describe('knob position', () => {
    it('should_throw_the_knob_right_when_checked', () => {
      render(<Switch checked label="Lesson schedule access" />)
      expect(knob().className).toContain('translate-x-5')
    })

    it('should_rest_the_knob_left_when_unchecked', () => {
      render(<Switch checked={false} label="Lesson schedule access" />)
      expect(knob().className).toContain('translate-x-0')
    })
  })

  describe('fill', () => {
    it('should_fill_the_track_when_checked', () => {
      render(<Switch checked label="Lesson schedule access" />)
      expect(screen.getByRole('switch').querySelector('[aria-hidden]')?.className)
        .toContain(switchTrackClasses.on)
    })

    it('should_use_the_off_track_when_unchecked', () => {
      render(<Switch checked={false} label="Lesson schedule access" />)
      expect(screen.getByRole('switch').querySelector('[aria-hidden]')?.className)
        .toContain(switchTrackClasses.off)
    })
  })

  /**
   * #1390: every control in the horse Access table submits through its own `<form action={...}>` so
   * it works before React hydrates. A `Switch` is therefore a submit button, not an
   * `<input type="checkbox">` -- a checkbox would need an `onChange` handler to commit, which is
   * exactly the script-only no-op that issue removed.
   */
  describe('progressive enhancement', () => {
    it('should_default_to_a_submit_button', () => {
      render(<Switch checked={false} label="Lesson schedule access" />)
      expect(screen.getByRole('switch').getAttribute('type')).toBe('submit')
    })

    it('should_let_a_caller_override_the_type', () => {
      render(<Switch checked={false} label="Lesson schedule access" type="button" />)
      expect(screen.getByRole('switch').getAttribute('type')).toBe('button')
    })

    it('should_forward_native_button_props', () => {
      const onClick = vi.fn()
      render(<Switch checked={false} label="Lesson schedule access" onClick={onClick} />)
      fireEvent.click(screen.getByRole('switch'))
      expect(onClick).toHaveBeenCalledOnce()
    })
  })

  describe('touch target', () => {
    it('should_meet_the_minimum_touch_height', () => {
      render(<Switch checked={false} label="Lesson schedule access" />)
      expect(screen.getByRole('switch').className).toContain('min-h-11')
    })

    it('should_meet_the_minimum_touch_width', () => {
      render(<Switch checked={false} label="Lesson schedule access" />)
      expect(screen.getByRole('switch').className).toContain('min-w-11')
    })
  })

  /**
   * A switch carries its state in fill and knob position with no text, so the 3:1 floor WCAG sets
   * for non-text UI components is the whole accessibility story here. Three pairs matter: the knob
   * against its track (which way is it thrown?), the track against the page (is there a control
   * here at all?), and the two track states against each other (is this one on or off?).
   *
   * Colours are parsed back out of the literal class strings rather than composed from names,
   * because Tailwind 4 only emits classes it can see spelled out in the source -- so the strings
   * are the single source of truth and this test reads them the way the browser does.
   *
   * `zinc-300` is the instinctive off-track and fails the knob pair at 1.2:1, which is why the off
   * state is `zinc-500`.
   */
  describe('non-text contrast', () => {
    const AA_NON_TEXT = 3

    describe.each(['on', 'off'] as const)('%s', (state) => {
      const track = bgColors(switchTrackClasses[state])
      const knobFill = bgColors(switchKnobClasses[state])

      describe.each(['light', 'dark'] as const)('%s scheme', (scheme) => {
        it('should_separate_the_knob_from_the_track', () => {
          expect(contrast(knobFill[scheme], track[scheme])).toBeGreaterThanOrEqual(AA_NON_TEXT)
        })

        it('should_separate_the_track_from_the_page', () => {
          expect(contrast(track[scheme], PAGE[scheme])).toBeGreaterThanOrEqual(AA_NON_TEXT)
        })
      })
    })

    describe.each(['light', 'dark'] as const)('%s scheme', (scheme) => {
      it('should_distinguish_the_two_track_states_from_each_other', () => {
        expect(
          contrast(bgColors(switchTrackClasses.on)[scheme], bgColors(switchTrackClasses.off)[scheme])
        ).toBeGreaterThanOrEqual(AA_NON_TEXT)
      })
    })
  })
})
