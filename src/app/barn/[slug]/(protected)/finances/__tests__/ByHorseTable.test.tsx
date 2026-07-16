import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { ByHorseTable } from '../ByHorseTable'

afterEach(cleanup)

const NO_HORSE_LABEL = 'No horse'

const rows = [
  { horseId: 'h-2', horseName: 'Zephyr', income: 100, expenses: 20, net: 80 },
  { horseId: 'h-1', horseName: 'Amber', income: 50, expenses: 10, net: 40 },
]

function rowNames(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent)
}

describe('ByHorseTable', () => {
  it('should_render_gross_header_instead_of_income', () => {
    render(<ByHorseTable rows={rows} slug="green-acres" monthParam="2026-06" noHorseLabel={NO_HORSE_LABEL} />)
    expect(screen.getByRole('columnheader', { name: 'Gross' })).toBeDefined()
  })

  it('should_not_render_income_header', () => {
    render(<ByHorseTable rows={rows} slug="green-acres" monthParam="2026-06" noHorseLabel={NO_HORSE_LABEL} />)
    expect(screen.queryByRole('columnheader', { name: 'Income' })).toBeNull()
  })

  it('should_default_sort_by_horse_name_ascending', () => {
    const { container } = render(<ByHorseTable rows={rows} slug="green-acres" monthParam="2026-06" noHorseLabel={NO_HORSE_LABEL} />)
    expect(rowNames(container)).toEqual(['Amber', 'Zephyr'])
  })

  it('should_flip_to_descending_when_horse_header_clicked', () => {
    const { container } = render(<ByHorseTable rows={rows} slug="green-acres" monthParam="2026-06" noHorseLabel={NO_HORSE_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: /Horse/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Zephyr', 'Amber'])
  })

  it('should_sort_ascending_by_gross_on_first_click', () => {
    const { container } = render(<ByHorseTable rows={rows} slug="green-acres" monthParam="2026-06" noHorseLabel={NO_HORSE_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: 'Gross' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Amber', 'Zephyr'])
  })

  it('should_sort_by_expenses_column_when_clicked', () => {
    const { container } = render(<ByHorseTable rows={rows} slug="green-acres" monthParam="2026-06" noHorseLabel={NO_HORSE_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: 'Expenses' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Amber', 'Zephyr'])
  })

  it('should_sort_by_net_column_when_clicked', () => {
    const { container } = render(<ByHorseTable rows={rows} slug="green-acres" monthParam="2026-06" noHorseLabel={NO_HORSE_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: 'Net' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Amber', 'Zephyr'])
  })

  it('should_link_horse_name_to_drilldown_with_month_param', () => {
    render(<ByHorseTable rows={rows} slug="green-acres" monthParam="2026-06" noHorseLabel={NO_HORSE_LABEL} />)
    expect(screen.getByRole('link', { name: 'Amber' }).getAttribute('href')).toBe('/barn/green-acres/finances/horses/h-1?month=2026-06')
  })

  it('should_render_no_horse_row_without_a_link', () => {
    render(<ByHorseTable rows={[{ horseId: NO_HORSE_LABEL, horseName: NO_HORSE_LABEL, income: 80, expenses: 0, net: 80 }]} slug="green-acres" monthParam="2026-06" noHorseLabel={NO_HORSE_LABEL} />)
    const row = screen.getByText(NO_HORSE_LABEL).closest('tr')!
    expect(within(row).queryByRole('link')).toBeNull()
  })

  it('should_render_no_horse_row_with_info_popover', () => {
    render(<ByHorseTable rows={[{ horseId: NO_HORSE_LABEL, horseName: NO_HORSE_LABEL, income: 80, expenses: 0, net: 80 }]} slug="green-acres" monthParam="2026-06" noHorseLabel={NO_HORSE_LABEL} />)
    const row = screen.getByText(NO_HORSE_LABEL).closest('tr')!
    expect(row.querySelector('button[aria-label="Info"]')).not.toBeNull()
  })
})
