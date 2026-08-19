import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InfoPopover } from '../InfoPopover'

describe('InfoPopover', () => {
  it('should_render_info_button', () => {
    render(<InfoPopover text="Some description" />)
    expect(screen.getByRole('button', { name: 'Info' })).toBeDefined()
  })

  it('should_not_show_popover_text_initially', () => {
    render(<InfoPopover text="Some description" />)
    expect(screen.queryByText('Some description')).toBeNull()
  })

  it('should_show_popover_text_on_click', () => {
    render(<InfoPopover text="Some description" />)
    fireEvent.click(screen.getByRole('button', { name: 'Info' }))
    expect(screen.getByText('Some description')).toBeDefined()
  })

  it('should_hide_popover_text_on_second_click', () => {
    render(<InfoPopover text="Some description" />)
    fireEvent.click(screen.getByRole('button', { name: 'Info' }))
    fireEvent.click(screen.getByRole('button', { name: 'Info' }))
    expect(screen.queryByText('Some description')).toBeNull()
  })

  it('should_align_the_popup_to_the_right_edge_by_default', () => {
    render(<InfoPopover text="Some description" />)
    fireEvent.click(screen.getByRole('button', { name: 'Info' }))
    expect(screen.getByText('Some description').className).toContain('right-0')
  })

  it('should_align_the_popup_to_the_left_edge_when_align_is_left', () => {
    render(<InfoPopover text="Some description" align="left" />)
    fireEvent.click(screen.getByRole('button', { name: 'Info' }))
    expect(screen.getByText('Some description').className).toContain('left-0')
  })

  it('should_close_on_outside_click', () => {
    render(
      <div>
        <InfoPopover text="Some description" />
        <span data-testid="outside">elsewhere</span>
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Info' }))
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('Some description')).toBeNull()
  })

  it('should_close_on_escape', () => {
    render(<InfoPopover text="Some description" />)
    fireEvent.click(screen.getByRole('button', { name: 'Info' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Some description')).toBeNull()
  })

  it('should_stay_open_on_other_keys', () => {
    render(<InfoPopover text="Some description" />)
    fireEvent.click(screen.getByRole('button', { name: 'Info' }))
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(screen.getByText('Some description')).toBeDefined()
  })

  it('should_reflect_the_open_state_in_aria_expanded', () => {
    render(<InfoPopover text="Some description" />)
    const button = screen.getByRole('button', { name: 'Info' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })
})
