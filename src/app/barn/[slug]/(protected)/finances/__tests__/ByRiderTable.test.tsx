import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { ByRiderTable } from '../ByRiderTable'

afterEach(cleanup)

const NO_RIDER_LABEL = 'No rider'

const rows = [
  { riderId: 'r-2', riderName: 'Zoe', totalIncome: 100 },
  { riderId: 'r-1', riderName: 'Alice', totalIncome: 50 },
]

function rowNames(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent)
}

describe('ByRiderTable', () => {
  it('should_render_net_header_instead_of_income', () => {
    render(<ByRiderTable rows={rows} slug="green-acres" monthParam="2026-06" noRiderLabel={NO_RIDER_LABEL} />)
    expect(screen.getByRole('columnheader', { name: 'Net' })).toBeDefined()
  })

  it('should_not_render_income_header', () => {
    render(<ByRiderTable rows={rows} slug="green-acres" monthParam="2026-06" noRiderLabel={NO_RIDER_LABEL} />)
    expect(screen.queryByRole('columnheader', { name: 'Income' })).toBeNull()
  })

  it('should_default_sort_by_rider_name_ascending', () => {
    const { container } = render(<ByRiderTable rows={rows} slug="green-acres" monthParam="2026-06" noRiderLabel={NO_RIDER_LABEL} />)
    expect(rowNames(container)).toEqual(['Alice', 'Zoe'])
  })

  it('should_flip_to_descending_when_rider_header_clicked', () => {
    const { container } = render(<ByRiderTable rows={rows} slug="green-acres" monthParam="2026-06" noRiderLabel={NO_RIDER_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: /Rider/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Zoe', 'Alice'])
  })

  it('should_sort_ascending_by_net_on_first_click', () => {
    const { container } = render(<ByRiderTable rows={rows} slug="green-acres" monthParam="2026-06" noRiderLabel={NO_RIDER_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: 'Net' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Alice', 'Zoe'])
  })

  it('should_link_rider_name_to_drilldown_with_month_param', () => {
    render(<ByRiderTable rows={rows} slug="green-acres" monthParam="2026-06" noRiderLabel={NO_RIDER_LABEL} />)
    expect(screen.getByRole('link', { name: 'Alice' }).getAttribute('href')).toBe('/barn/green-acres/finances/riders/r-1?month=2026-06')
  })

  it('should_render_no_rider_row_without_a_link', () => {
    render(<ByRiderTable rows={[{ riderId: NO_RIDER_LABEL, riderName: NO_RIDER_LABEL, totalIncome: 80 }]} slug="green-acres" monthParam="2026-06" noRiderLabel={NO_RIDER_LABEL} />)
    const row = screen.getByText(NO_RIDER_LABEL).closest('tr')!
    expect(within(row).queryByRole('link')).toBeNull()
  })

  it('should_render_no_rider_row_with_info_popover', () => {
    render(<ByRiderTable rows={[{ riderId: NO_RIDER_LABEL, riderName: NO_RIDER_LABEL, totalIncome: 80 }]} slug="green-acres" monthParam="2026-06" noRiderLabel={NO_RIDER_LABEL} />)
    const row = screen.getByText(NO_RIDER_LABEL).closest('tr')!
    expect(row.querySelector('button[aria-label="Info"]')).not.toBeNull()
  })
})
