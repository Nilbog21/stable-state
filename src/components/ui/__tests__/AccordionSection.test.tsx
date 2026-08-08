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
