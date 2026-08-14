import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { OlderExpensesToggle } from '../OlderExpensesToggle'
import { createMockExpenseWithHorses } from '@/test/fixtures'

afterEach(cleanup)

const mockExpense = createMockExpenseWithHorses({ recipient: 'Farrier Co' })

/** Barn-local wall clock, threaded straight through to each card. Value is irrelevant here. */
const NOW_WALL = '2026-06-01T00:00:00'

describe('OlderExpensesToggle', () => {
  it('should_not_render_button_when_no_older_expenses', () => {
    render(<OlderExpensesToggle expenses={[]} slug="green-acres" nowWall={NOW_WALL} />)
    expect(screen.queryByRole('button', { name: /show older expenses/i })).toBeNull()
  })

  it('should_render_show_older_expenses_button_when_expenses_exist', () => {
    render(<OlderExpensesToggle expenses={[mockExpense]} slug="green-acres" nowWall={NOW_WALL} />)
    expect(screen.getByRole('button', { name: /show older expenses/i })).toBeDefined()
  })

  it('should_hide_older_expenses_by_default', () => {
    render(<OlderExpensesToggle expenses={[mockExpense]} slug="green-acres" nowWall={NOW_WALL} />)
    expect(screen.queryByText('Farrier Co')).toBeNull()
  })

  it('should_show_older_expenses_after_clicking_button', () => {
    render(<OlderExpensesToggle expenses={[mockExpense]} slug="green-acres" nowWall={NOW_WALL} />)
    fireEvent.click(screen.getByRole('button', { name: /show older expenses/i }))
    expect(screen.getByText(/Farrier Co/)).toBeDefined()
  })

  it('should_show_hide_older_expenses_button_label_after_expanding', () => {
    render(<OlderExpensesToggle expenses={[mockExpense]} slug="green-acres" nowWall={NOW_WALL} />)
    fireEvent.click(screen.getByRole('button', { name: /show older expenses/i }))
    expect(screen.getByRole('button', { name: /hide older expenses/i })).toBeDefined()
  })

  it('should_collapse_older_expenses_after_clicking_button_again', () => {
    render(<OlderExpensesToggle expenses={[mockExpense]} slug="green-acres" nowWall={NOW_WALL} />)
    fireEvent.click(screen.getByRole('button', { name: /show older expenses/i }))
    fireEvent.click(screen.getByRole('button', { name: /hide older expenses/i }))
    expect(screen.queryByText('Farrier Co')).toBeNull()
  })
})
