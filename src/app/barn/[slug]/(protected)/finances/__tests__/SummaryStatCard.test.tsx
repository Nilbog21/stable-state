import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SummaryStatCard } from '../SummaryStatCard'

describe('SummaryStatCard', () => {
  it('should_render_label_and_value', () => {
    render(<SummaryStatCard label="Gross Income" value="$225.00" infoText="Some description" />)
    expect(screen.getByText(/Gross Income/)).toBeDefined()
    expect(screen.getByText('$225.00')).toBeDefined()
  })

  it('should_render_the_whole_card_as_a_single_button', () => {
    render(<SummaryStatCard label="Gross Income" value="$225.00" infoText="Some description" />)
    expect(screen.getByRole('button', { name: /Gross Income/ })).toBeDefined()
  })

  it('should_not_show_popover_text_initially', () => {
    render(<SummaryStatCard label="Gross Income" value="$225.00" infoText="Some description" />)
    expect(screen.queryByText('Some description')).toBeNull()
  })

  it('should_show_popover_text_on_click', () => {
    render(<SummaryStatCard label="Gross Income" value="$225.00" infoText="Some description" />)
    fireEvent.click(screen.getByRole('button', { name: /Gross Income/ }))
    expect(screen.getByText('Some description')).toBeDefined()
  })

  it('should_hide_popover_text_on_second_click', () => {
    render(<SummaryStatCard label="Gross Income" value="$225.00" infoText="Some description" />)
    fireEvent.click(screen.getByRole('button', { name: /Gross Income/ }))
    fireEvent.click(screen.getByRole('button', { name: /Gross Income/ }))
    expect(screen.queryByText('Some description')).toBeNull()
  })
})
