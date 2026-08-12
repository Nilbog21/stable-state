import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccordionSection } from '../AccordionSection'

describe('AccordionSection', () => {
  it('should_render_the_title_as_a_heading', () => {
    render(<AccordionSection title="Documents">body</AccordionSection>)
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeDefined()
  })

  it('should_render_children', () => {
    render(<AccordionSection title="Documents">body</AccordionSection>)
    expect(screen.getByText('body')).toBeDefined()
  })

  it('should_render_collapsed_by_default', () => {
    render(<AccordionSection title="Documents">body</AccordionSection>)
    expect(document.querySelector('details')?.open).toBe(false)
  })

  it('should_render_open_when_defaultOpen_is_set', () => {
    render(<AccordionSection title="Documents" defaultOpen>body</AccordionSection>)
    expect(document.querySelector('details')?.open).toBe(true)
  })

  it('should_render_the_hint_in_the_summary', () => {
    render(<AccordionSection title="Documents" hint="2">body</AccordionSection>)
    expect(document.querySelector('summary')?.textContent).toContain('2')
  })

  it('should_not_render_a_hint_when_none_is_given', () => {
    render(<AccordionSection title="Documents">body</AccordionSection>)
    expect(document.querySelector('summary')?.textContent).toBe('Documents')
  })

  it('should_render_headerExtra', () => {
    render(
      <AccordionSection title="Documents" headerExtra={<button>Add</button>}>
        body
      </AccordionSection>
    )
    expect(screen.getByRole('button', { name: 'Add' })).toBeDefined()
  })

  it('should_render_open_when_savedSlug_matches_slug', () => {
    render(<AccordionSection title="Lesson Tiers" slug="tiers" savedSlug="tiers">body</AccordionSection>)
    expect(document.querySelector('details')?.open).toBe(true)
  })

  it('should_render_a_saved_badge_when_savedSlug_matches_slug', () => {
    render(<AccordionSection title="Lesson Tiers" slug="tiers" savedSlug="tiers">body</AccordionSection>)
    expect(screen.getByText('Saved')).toBeDefined()
  })

  it('should_render_the_saved_badge_as_a_sibling_of_the_heading', () => {
    // checklist-phase4-settings-fields.spec.ts identifies a section by `summary h2` textContent
    // equality, so a badge nested inside the heading silently breaks section lookup.
    render(<AccordionSection title="Lesson Tiers" slug="tiers" savedSlug="tiers">body</AccordionSection>)
    expect(document.querySelector('summary h2')?.textContent).toBe('Lesson Tiers')
  })

  it('should_render_open_with_no_badge_when_openSlug_matches_slug', () => {
    render(<AccordionSection title="Barn Events" slug="events" openSlug="events">body</AccordionSection>)
    expect(document.querySelector('details')?.open).toBe(true)
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('should_stay_closed_when_neither_param_matches_the_slug', () => {
    render(
      <AccordionSection title="Barn Events" slug="events" savedSlug="tiers" openSlug="tiers">
        body
      </AccordionSection>
    )
    expect(document.querySelector('details')?.open).toBe(false)
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('should_stay_closed_when_the_section_has_no_slug_and_no_params_are_given', () => {
    // The undefined === undefined trap: a slugless section (horse detail's five) must not open
    // just because the page passed no params.
    render(<AccordionSection title="Documents">body</AccordionSection>)
    expect(document.querySelector('details')?.open).toBe(false)
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('should_not_nest_headerExtra_inside_the_summary', () => {
    // The extra sits in an absolutely-positioned sibling, not inside <summary>: a button
    // inside a summary toggles the accordion on click instead of running its own action.
    render(
      <AccordionSection title="Documents" headerExtra={<button>Add</button>}>
        body
      </AccordionSection>
    )
    expect(document.querySelector('summary')?.querySelector('button')).toBeNull()
  })
})
