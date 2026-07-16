import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ReconciliationFoot } from '../ReconciliationFoot'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

afterEach(cleanup)

const gross: ReconciliationColumn = { subtotal: 425, outside: 0, unattributed: 0, total: 425 }
const expenses: ReconciliationColumn = { subtotal: 425, outside: 6775, unattributed: 90, total: 7290 }
const net: ReconciliationColumn = { subtotal: 0, outside: -6775, unattributed: -90, total: -6865 }

function renderTable(props: Partial<React.ComponentProps<typeof ReconciliationFoot>> = {}) {
  return render(
    <table>
      <tbody>
        <tr>
          <td>row</td>
        </tr>
      </tbody>
      <ReconciliationFoot
        labelColSpan={1}
        gross={gross}
        expenses={expenses}
        net={net}
        outsideInfoText="Real money this table's dimension doesn't track"
        unattributedInfoText="A genuine data gap"
        {...props}
      />
    </table>
  )
}

describe('ReconciliationFoot', () => {
  it('should_render_the_subtotal_row', () => {
    renderTable()
    expect(screen.getByText('Subtotal')).toBeDefined()
  })

  it('should_render_the_outside_this_view_row', () => {
    renderTable()
    expect(screen.getByText('Outside this view')).toBeDefined()
  })

  it('should_render_the_unattributed_row', () => {
    renderTable()
    expect(screen.getByText('Unattributed')).toBeDefined()
  })

  it('should_render_the_total_row', () => {
    renderTable()
    expect(screen.getByText('Total')).toBeDefined()
  })

  it('should_render_the_total_row_values', () => {
    renderTable()
    const totalRow = screen.getByText('Total').closest('tr')!
    const cells = Array.from(totalRow.querySelectorAll('td')).map((td) => td.textContent)
    expect(cells).toEqual(['Total', '$425.00', '($7,290.00)', '($6,865.00)'])
  })

  it('should_render_the_expenses_column_in_accounting_parens', () => {
    renderTable()
    const subtotalRow = screen.getByText('Subtotal').closest('tr')!
    const cells = Array.from(subtotalRow.querySelectorAll('td')).map((td) => td.textContent)
    expect(cells).toEqual(['Subtotal', '$425.00', '($425.00)', '$0.00'])
  })

  it('should_render_a_dash_for_zero_in_the_expenses_column_instead_of_dollar_zero', () => {
    renderTable({
      gross: { subtotal: 425, outside: 0, unattributed: 0, total: 425 },
      expenses: { subtotal: 425, outside: 6775, unattributed: 0, total: 7200 },
      net: { subtotal: 0, outside: -6775, unattributed: 0, total: -6775 },
    })
    const unattributedRow = screen.getByText('Unattributed').closest('tr')!
    const cells = Array.from(unattributedRow.querySelectorAll('td')).map((td) => td.textContent)
    expect(cells).toEqual(['Unattributedⓘ', '$0.00', '—', '$0.00'])
  })

  it('should_render_negative_values_in_accounting_parens', () => {
    renderTable()
    const outsideRow = screen.getByText('Outside this view').closest('tr')!
    expect(outsideRow.textContent).toContain('($6,775.00)')
  })

  it('should_render_a_dash_for_a_null_column', () => {
    renderTable({ gross: null, net: null })
    const totalRow = screen.getByText('Total').closest('tr')!
    const cells = Array.from(totalRow.querySelectorAll('td')).map((td) => td.textContent)
    expect(cells).toEqual(['Total', '—', '($7,290.00)', '—'])
  })

  it('should_show_an_info_popover_on_the_outside_this_view_row', () => {
    renderTable()
    const row = screen.getByText('Outside this view').closest('tr')!
    expect(row.querySelector('button[aria-label="Info"]')).not.toBeNull()
  })

  it('should_show_an_info_popover_on_the_unattributed_row', () => {
    renderTable()
    const row = screen.getByText('Unattributed').closest('tr')!
    expect(row.querySelector('button[aria-label="Info"]')).not.toBeNull()
  })

  it('should_not_show_an_info_popover_on_the_subtotal_row', () => {
    renderTable()
    const row = screen.getByText('Subtotal').closest('tr')!
    expect(row.querySelector('button[aria-label="Info"]')).toBeNull()
  })

  it('should_not_show_an_info_popover_on_the_total_row', () => {
    renderTable()
    const row = screen.getByText('Total').closest('tr')!
    expect(row.querySelector('button[aria-label="Info"]')).toBeNull()
  })

  it('should_span_the_label_cell_across_labelColSpan_columns', () => {
    renderTable({ labelColSpan: 2 })
    const totalRow = screen.getByText('Total').closest('tr')!
    expect(totalRow.querySelector('td')?.getAttribute('colspan')).toBe('2')
  })

  it('should_render_as_a_tfoot_element', () => {
    const { container } = renderTable()
    expect(container.querySelector('tfoot')).not.toBeNull()
  })
})
