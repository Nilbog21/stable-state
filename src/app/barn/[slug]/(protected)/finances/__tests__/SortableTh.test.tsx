import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SortableTh } from '../SortableTh'

afterEach(cleanup)

function renderTh(onSort = vi.fn()) {
  return render(
    <table>
      <thead>
        <tr>
          <SortableTh sortKey="net" label="Net" activeKey="net" dir="asc" onSort={onSort} infoText="Gross minus Expenses" />
        </tr>
      </thead>
    </table>
  )
}

describe('SortableTh info popover', () => {
  it('should_render_info_trigger_when_infoText_is_provided', () => {
    renderTh()
    expect(screen.getByRole('button', { name: 'Info' })).toBeDefined()
  })

  it('should_not_render_info_trigger_when_infoText_is_omitted', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableTh sortKey="net" label="Net" activeKey="net" dir="asc" onSort={vi.fn()} />
          </tr>
        </thead>
      </table>
    )
    expect(screen.queryByRole('button', { name: 'Info' })).toBeNull()
  })

  it('should_render_info_trigger_as_a_sibling_of_the_sort_button_not_nested_inside_it', () => {
    renderTh()
    const infoButton = screen.getByRole('button', { name: 'Info' })
    const sortButton = screen.getByRole('button', { name: /Net/ })
    expect(sortButton.contains(infoButton)).toBe(false)
    expect(infoButton.contains(sortButton)).toBe(false)
  })

  it('should_not_trigger_sort_when_info_trigger_is_clicked', () => {
    const onSort = vi.fn()
    renderTh(onSort)
    fireEvent.click(screen.getByRole('button', { name: 'Info' }))
    expect(onSort).not.toHaveBeenCalled()
  })

  it('should_still_trigger_sort_when_the_sort_button_itself_is_clicked', () => {
    const onSort = vi.fn()
    renderTh(onSort)
    fireEvent.click(screen.getByRole('button', { name: /Net/ }))
    expect(onSort).toHaveBeenCalledWith('net')
  })

  it('should_show_the_info_text_when_the_info_trigger_is_clicked', () => {
    renderTh()
    fireEvent.click(screen.getByRole('button', { name: 'Info' }))
    expect(screen.getByText('Gross minus Expenses')).toBeDefined()
  })
})

describe('SortableTh non-sortable mode', () => {
  function renderPlain(infoText?: string) {
    return render(
      <table>
        <thead>
          <tr>
            <SortableTh label="Expenses" infoText={infoText} />
          </tr>
        </thead>
      </table>
    )
  }

  it('should_render_the_label_when_onSort_is_omitted', () => {
    renderPlain()
    expect(screen.getByText('Expenses')).toBeDefined()
  })

  it('should_render_no_sort_button_when_onSort_is_omitted', () => {
    renderPlain()
    expect(screen.queryByRole('button', { name: /Expenses/ })).toBeNull()
  })

  it('should_not_set_aria_sort_when_onSort_is_omitted', () => {
    renderPlain()
    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBeNull()
  })

  it('should_still_render_info_trigger_as_a_sibling_when_non_sortable', () => {
    renderPlain('No expense is tracked per rider')
    const infoButton = screen.getByRole('button', { name: 'Info' })
    const header = screen.getByRole('columnheader')
    expect(header.contains(infoButton)).toBe(true)
  })

  it('should_show_the_info_text_when_non_sortable_info_trigger_is_clicked', () => {
    renderPlain('No expense is tracked per rider')
    fireEvent.click(screen.getByRole('button', { name: 'Info' }))
    expect(screen.getByText('No expense is tracked per rider')).toBeDefined()
  })

  it('should_place_the_label_and_info_trigger_in_an_inline_flex_row', () => {
    const { container } = renderPlain('No expense is tracked per rider')
    const row = container.querySelector('th > div')
    expect(row?.className).toContain('inline-flex')
  })

  it('should_place_the_label_inside_the_inline_flex_row', () => {
    const { container } = renderPlain('No expense is tracked per rider')
    const row = container.querySelector('th > div')
    expect(row?.contains(screen.getByText('Expenses'))).toBe(true)
  })

  it('should_place_the_info_trigger_inside_the_inline_flex_row', () => {
    const { container } = renderPlain('No expense is tracked per rider')
    const row = container.querySelector('th > div')
    expect(row?.contains(screen.getByRole('button', { name: 'Info' }))).toBe(true)
  })
})
