import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { ByInstructorTable } from '../ByInstructorTable'

afterEach(cleanup)

const NON_LESSON_INCOME_LABEL = 'Non-lesson income'
const NO_INSTRUCTOR_LABEL = 'No instructor'

const rows = [
  { trainerId: 't-2', trainerName: 'Zane', totalIncome: 100, grossIncome: 120 },
  { trainerId: 't-1', trainerName: 'Amy', totalIncome: 50, grossIncome: 60 },
]

function rowNames(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent)
}

describe('ByInstructorTable', () => {
  it('should_render_gross_header_instead_of_total_income', () => {
    render(<ByInstructorTable rows={rows} slug="green-acres" monthParam="2026-06" nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} noInstructorLabel={NO_INSTRUCTOR_LABEL} />)
    expect(screen.getByRole('columnheader', { name: 'Gross' })).toBeDefined()
  })

  it('should_not_render_total_income_header', () => {
    render(<ByInstructorTable rows={rows} slug="green-acres" monthParam="2026-06" nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} noInstructorLabel={NO_INSTRUCTOR_LABEL} />)
    expect(screen.queryByRole('columnheader', { name: 'Total Income' })).toBeNull()
  })

  it('should_default_sort_by_trainer_name_ascending', () => {
    const { container } = render(<ByInstructorTable rows={rows} slug="green-acres" monthParam="2026-06" nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} noInstructorLabel={NO_INSTRUCTOR_LABEL} />)
    expect(rowNames(container)).toEqual(['Amy', 'Zane'])
  })

  it('should_flip_to_descending_when_trainer_header_clicked', () => {
    const { container } = render(<ByInstructorTable rows={rows} slug="green-acres" monthParam="2026-06" nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} noInstructorLabel={NO_INSTRUCTOR_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: /Trainer/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Zane', 'Amy'])
  })

  it('should_sort_ascending_by_gross_on_first_click', () => {
    const { container } = render(<ByInstructorTable rows={rows} slug="green-acres" monthParam="2026-06" nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} noInstructorLabel={NO_INSTRUCTOR_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: 'Gross' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Amy', 'Zane'])
  })

  it('should_sort_a_null_gross_before_a_set_gross_when_ascending', () => {
    const { container } = render(
      <ByInstructorTable
        rows={[
          { trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: 300, grossIncome: null },
          ...rows,
        ]}
        slug="green-acres"
        monthParam="2026-06"
        nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL}
        noInstructorLabel={NO_INSTRUCTOR_LABEL}
      />
    )
    fireEvent.click(screen.getByRole('columnheader', { name: 'Gross' }).querySelector('button')!)
    expect(rowNames(container)).toEqual([`${NON_LESSON_INCOME_LABEL}ⓘ`, 'Amy', 'Zane'])
  })

  it('should_sort_by_instructor_cut_column_when_clicked', () => {
    const { container } = render(<ByInstructorTable rows={rows} slug="green-acres" monthParam="2026-06" nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} noInstructorLabel={NO_INSTRUCTOR_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: 'Instructor Cut' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Amy', 'Zane'])
  })

  it('should_sort_a_null_instructor_cut_before_a_set_instructor_cut_when_ascending', () => {
    const { container } = render(
      <ByInstructorTable
        rows={[
          { trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: 300, grossIncome: null },
          ...rows,
        ]}
        slug="green-acres"
        monthParam="2026-06"
        nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL}
        noInstructorLabel={NO_INSTRUCTOR_LABEL}
      />
    )
    fireEvent.click(screen.getByRole('columnheader', { name: 'Instructor Cut' }).querySelector('button')!)
    expect(rowNames(container)).toEqual([`${NON_LESSON_INCOME_LABEL}ⓘ`, 'Amy', 'Zane'])
  })

  it('should_sort_by_net_column_when_clicked', () => {
    const { container } = render(<ByInstructorTable rows={rows} slug="green-acres" monthParam="2026-06" nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} noInstructorLabel={NO_INSTRUCTOR_LABEL} />)
    fireEvent.click(screen.getByRole('columnheader', { name: 'Net' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Amy', 'Zane'])
  })

  it('should_show_dash_for_null_gross', () => {
    render(<ByInstructorTable rows={[{ trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: 300, grossIncome: null }]} slug="green-acres" monthParam="2026-06" nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} noInstructorLabel={NO_INSTRUCTOR_LABEL} />)
    const row = screen.getByText(NON_LESSON_INCOME_LABEL).closest('tr')!
    expect(within(row).getAllByRole('cell')[1].textContent).toBe('—')
  })

  it('should_show_dash_for_null_instructor_cut', () => {
    render(<ByInstructorTable rows={[{ trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: 300, grossIncome: null }]} slug="green-acres" monthParam="2026-06" nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} noInstructorLabel={NO_INSTRUCTOR_LABEL} />)
    const row = screen.getByText(NON_LESSON_INCOME_LABEL).closest('tr')!
    expect(within(row).getAllByRole('cell')[2].textContent).toBe('—')
  })

  it('should_link_trainer_name_to_drilldown_with_month_param', () => {
    render(<ByInstructorTable rows={rows} slug="green-acres" monthParam="2026-06" nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} noInstructorLabel={NO_INSTRUCTOR_LABEL} />)
    expect(screen.getByRole('link', { name: 'Amy' }).getAttribute('href')).toBe('/barn/green-acres/finances/trainers/t-1?month=2026-06')
  })

  it('should_render_non_lesson_income_row_without_a_link', () => {
    render(<ByInstructorTable rows={[{ trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: 300, grossIncome: null }]} slug="green-acres" monthParam="2026-06" nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} noInstructorLabel={NO_INSTRUCTOR_LABEL} />)
    const row = screen.getByText(NON_LESSON_INCOME_LABEL).closest('tr')!
    expect(within(row).queryByRole('link')).toBeNull()
  })

  it('should_render_no_instructor_row_with_info_popover', () => {
    render(<ByInstructorTable rows={[{ trainerId: NO_INSTRUCTOR_LABEL, trainerName: NO_INSTRUCTOR_LABEL, totalIncome: 100, grossIncome: 100 }]} slug="green-acres" monthParam="2026-06" nonLessonIncomeLabel={NON_LESSON_INCOME_LABEL} noInstructorLabel={NO_INSTRUCTOR_LABEL} />)
    const row = screen.getByText(NO_INSTRUCTOR_LABEL).closest('tr')!
    expect(row.querySelector('button[aria-label="Info"]')).not.toBeNull()
  })
})
