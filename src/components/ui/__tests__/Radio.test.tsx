import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Radio, radioDotClasses, radioRingClasses } from '../Radio'
import { PAGE, bgColors, contrast } from '@/test/tailwind-contrast'

/** The dot, reached through the decorative ring it sits inside. */
function dot(): HTMLElement {
  const el = screen.getByRole('radio').querySelector('[aria-hidden] > span')
  if (!(el instanceof HTMLElement)) throw new Error('no dot inside the radio')
  return el
}

/** The ring around the dot. */
function ring(): HTMLElement {
  const el = screen.getByRole('radio').querySelector('[aria-hidden]')
  if (!(el instanceof HTMLElement)) throw new Error('no ring inside the radio')
  return el
}

/**
 * The two colour tokens a `border-`/`dark:border-` class string declares, read back out of the
 * string rather than restated — Tailwind's scanner needs the literal, so the component can't build
 * it from a shared constant, and a restated pair would keep passing after the real one shifted.
 * `bgColors` covers the `bg-` half; there is no `border` equivalent because this is its one caller.
 */
function ringTones(classes: string): { light: string; dark: string } {
  const parts = classes.split(' ')
  const light = parts.find((c) => /^border-[a-z]+-\d+$/.test(c))!.replace('border-', '')
  const dark = parts.find((c) => /^dark:border-[a-z]+-\d+$/.test(c))?.replace('dark:border-', '')
  return { light, dark: dark ?? light }
}

describe('Radio', () => {
  describe('state', () => {
    it('should_expose_the_radio_role', () => {
      render(<Radio checked={false} label="Read" />)
      expect(screen.getByRole('radio')).toBeDefined()
    })

    it('should_report_checked_through_aria_checked', () => {
      render(<Radio checked label="Read" />)
      expect(screen.getByRole('radio').getAttribute('aria-checked')).toBe('true')
    })

    it('should_report_unchecked_through_aria_checked', () => {
      render(<Radio checked={false} label="Read" />)
      expect(screen.getByRole('radio').getAttribute('aria-checked')).toBe('false')
    })

    // Unlike `Switch`, the label is visible text rather than an `aria-label`: a radio's label names
    // the *option*, which the user has to be able to read to pick between three of them.
    it('should_name_itself_from_the_visible_label', () => {
      render(<Radio checked={false} label="Set as Owner" />)
      expect(screen.getByRole('radio', { name: 'Set as Owner' }).textContent).toBe('Set as Owner')
    })

    // The ring and dot are decoration -- the state a screen reader needs is on the button, and
    // announcing the fill a second time is worse than not announcing it at all.
    it('should_hide_the_ring_from_assistive_tech', () => {
      render(<Radio checked={false} label="Read" />)
      expect(screen.getByRole('radio').querySelector('[aria-hidden]')).not.toBeNull()
    })
  })

  describe('fill', () => {
    it('should_fill_the_dot_when_checked', () => {
      render(<Radio checked label="Read" />)
      expect(dot().className).toContain(radioDotClasses.on)
    })

    it('should_leave_the_dot_empty_when_unchecked', () => {
      render(<Radio checked={false} label="Read" />)
      expect(dot().className).toContain(radioDotClasses.off)
    })

    it('should_darken_the_ring_when_checked', () => {
      render(<Radio checked label="Read" />)
      expect(ring().className).toContain(radioRingClasses.on)
    })

    it('should_use_the_resting_ring_when_unchecked', () => {
      render(<Radio checked={false} label="Read" />)
      expect(ring().className).toContain(radioRingClasses.off)
    })
  })

  /**
   * #1390: every control in the horse Access table submits through its own `<form action={...}>` so
   * it works before React hydrates. A `Radio` is therefore a submit button, not an
   * `<input type="radio">` -- a native radio would need an `onChange` handler to commit, which is
   * exactly the script-only no-op that issue removed, and is why #1548 left the Documents column as
   * buttons. #1549 takes the radio's *vocabulary* without taking its `onChange`.
   */
  describe('progressive enhancement', () => {
    it('should_default_to_a_submit_button', () => {
      render(<Radio checked={false} label="Read" />)
      expect(screen.getByRole('radio').getAttribute('type')).toBe('submit')
    })

    it('should_let_a_caller_override_the_type', () => {
      render(<Radio checked={false} label="Read" type="button" />)
      expect(screen.getByRole('radio').getAttribute('type')).toBe('button')
    })

    it('should_forward_native_button_props', () => {
      const onClick = vi.fn()
      render(<Radio checked={false} label="Read" onClick={onClick} />)
      fireEvent.click(screen.getByRole('radio'))
      expect(onClick).toHaveBeenCalledOnce()
    })
  })

  describe('touch target', () => {
    it('should_meet_the_minimum_touch_height', () => {
      render(<Radio checked={false} label="Read" />)
      expect(screen.getByRole('radio').className).toContain('min-h-11')
    })
  })

  /**
   * The ring and dot carry the state; the label says which option, not whether it is picked. So the
   * 3:1 floor WCAG sets for non-text UI components applies to two pairs: the ring against the page
   * (is there a control here at all?) and the checked dot against the page (is it picked?). The
   * unchecked dot is transparent by design and has nothing to measure.
   */
  describe('non-text contrast', () => {
    const AA_NON_TEXT = 3

    describe.each(['on', 'off'] as const)('%s ring', (state) => {
      const tones = ringTones(radioRingClasses[state])

      describe.each(['light', 'dark'] as const)('%s scheme', (scheme) => {
        it('should_separate_the_ring_from_the_page', () => {
          expect(contrast(tones[scheme], PAGE[scheme])).toBeGreaterThanOrEqual(AA_NON_TEXT)
        })
      })
    })

    describe.each(['light', 'dark'] as const)('%s scheme', (scheme) => {
      it('should_separate_the_checked_dot_from_the_page', () => {
        expect(contrast(bgColors(radioDotClasses.on)[scheme], PAGE[scheme])).toBeGreaterThanOrEqual(AA_NON_TEXT)
      })
    })
  })
})
