import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ByTierTable } from '../ByTierTable'

afterEach(cleanup)

const NON_LESSON_INCOME_LABEL = 'Non-lesson income'

const rows = [
  { tierName: 'Standard', price: 50, lessonCount: 2, subtotal: 100, instructorCut: 25 },
  { tierName: 'Premium', price: 75, lessonCount: 1, subtotal: 75, instructorCut: 0 },
]

function rowNames(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent)
}

describe('ByTierTable', () => {
  it('should_render_headers_in_order_with_gross_between_lessons_and_instructor_cut', () => {
    render(<ByTierTable rows={rows} nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} />)
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼]/g, '').trim())
    expect(headers).toEqual(['Tier', 'Price', 'Lessons', 'Gross', 'Instructor Cut', 'Net'])
  })

  it('should_compute_gross_as_net_plus_instructor_cut', () => {
    render(<ByTierTable rows={rows} nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} />)
    const row = screen.getByText('Standard').closest('tr')!
    expect(row.textContent).toContain('$125.00')
  })

  it('should_default_sort_by_tier_name_ascending', () => {
    const { container } = render(<ByTierTable rows={rows} nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} />)
    expect(rowNames(container)).toEqual(['Premium', 'Standard'])
  })

  it('should_mark_default_column_aria_sort_ascending', () => {
    render(<ByTierTable rows={rows} nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} />)
    expect(screen.getByRole('columnheader', { name: /Tier/ }).getAttribute('aria-sort')).toBe('ascending')
  })

  it('should_flip_default_column_to_descending_on_click', () => {
    render(<ByTierTable rows={rows} nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} />)
    const header = screen.getByRole('columnheader', { name: /Tier/ })
    fireEvent.click(header.querySelector('button')!)
    expect(header.getAttribute('aria-sort')).toBe('descending')
  })

  it('should_reverse_row_order_when_tier_column_flips_to_descending', () => {
    const { container } = render(<ByTierTable rows={rows} nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: /Tier/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Standard', 'Premium'])
  })

  it('should_sort_ascending_on_first_click_of_a_non_default_column', () => {
    const { container } = render(<ByTierTable rows={rows} nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: 'Price' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Standard', 'Premium'])
  })

  it('should_sort_a_null_price_before_a_set_price_when_ascending', () => {
    const { container } = render(
      <ByTierTable
        rows={[
          { tierName: 'Custom', price: null, lessonCount: 1, subtotal: 100, instructorCut: 25 },
          { tierName: 'Standard', price: 50, lessonCount: 2, subtotal: 100, instructorCut: 25 },
        ]}
        nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL}
      />
    )
    fireEvent.click(screen.getByRole('columnheader', { name: 'Price' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Custom', 'Standard'])
  })

  it('should_sort_by_lessons_column_when_clicked', () => {
    const { container } = render(<ByTierTable rows={rows} nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: 'Lessons' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Premium', 'Standard'])
  })

  it('should_sort_by_gross_column_when_clicked', () => {
    const { container } = render(<ByTierTable rows={rows} nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: 'Gross' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Premium', 'Standard'])
  })

  it('should_sort_by_instructor_cut_column_when_clicked', () => {
    const { container } = render(<ByTierTable rows={rows} nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: 'Instructor Cut' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Premium', 'Standard'])
  })

  it('should_sort_by_net_column_when_clicked', () => {
    const { container } = render(<ByTierTable rows={rows} nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: 'Net' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Premium', 'Standard'])
  })

  it('should_show_dash_for_null_price', () => {
    render(<ByTierTable rows={[{ tierName: 'Custom', price: null, lessonCount: 1, subtotal: 100, instructorCut: 25 }]} nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} />)
    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_render_info_popover_on_non_lesson_income_row', () => {
    render(<ByTierTable rows={[{ tierName: NON_LESSON_INCOME_LABEL, price: null, lessonCount: 1, subtotal: 300, instructorCut: 0 }]} nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} />)
    const row = screen.getByText(NON_LESSON_INCOME_LABEL).closest('tr')!
    expect(row.querySelector('button[aria-label="Info"]')).not.toBeNull()
  })

  it('should_render_blank_lessons_cell_for_non_lesson_income_row', () => {
    render(<ByTierTable rows={[{ tierName: NON_LESSON_INCOME_LABEL, price: null, lessonCount: 1, subtotal: 300, instructorCut: 0 }]} nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} />)
    const row = screen.getByText(NON_LESSON_INCOME_LABEL).closest('tr')!
    expect(row.querySelectorAll('td')[2].textContent).toBe('')
  })
})
