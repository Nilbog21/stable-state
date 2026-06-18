import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { HorseOverviewTable } from '../HorseOverviewTable'

afterEach(cleanup)

const horses = [
  { id: 'horse-1', name: 'Thunderbolt', lessonCount: 3, totalExertion: 12, jumpingCount: 1 },
  { id: 'horse-2', name: 'Shadow', lessonCount: 5, totalExertion: 4, jumpingCount: 3 },
  { id: 'horse-3', name: 'Ariel', lessonCount: 2, totalExertion: 8, jumpingCount: 2 },
]

describe('HorseOverviewTable', () => {
  it('should_render_horse_names', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
    expect(screen.getByText('Shadow')).toBeDefined()
    expect(screen.getByText('Ariel')).toBeDefined()
  })

  it('should_render_column_headers_in_correct_order', () => {
    render(<HorseOverviewTable horses={horses} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers[0].textContent).toContain('Horse')
    expect(headers[1].textContent).toContain('Total Exertion (7d)')
    expect(headers[2].textContent).toContain('# Jumping (7d)')
    expect(headers[3].textContent).toContain('Lessons (7d)')
  })

  it('should_sort_by_total_exertion_descending_by_default', () => {
    render(<HorseOverviewTable horses={horses} />)
    const cells = screen.getAllByRole('cell')
    const names = cells.filter(c => ['Thunderbolt', 'Shadow', 'Ariel'].includes(c.textContent!))
    expect(names[0].textContent).toBe('Thunderbolt')
    expect(names[1].textContent).toBe('Ariel')
    expect(names[2].textContent).toBe('Shadow')
  })

  it('should_show_down_arrow_on_total_exertion_column_by_default', () => {
    render(<HorseOverviewTable horses={horses} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers[1].textContent).toContain('↓')
  })

  it('should_show_no_arrow_on_inactive_columns_by_default', () => {
    render(<HorseOverviewTable horses={horses} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers[0].textContent).not.toContain('↑')
    expect(headers[0].textContent).not.toContain('↓')
    expect(headers[2].textContent).not.toContain('↑')
    expect(headers[2].textContent).not.toContain('↓')
    expect(headers[3].textContent).not.toContain('↑')
    expect(headers[3].textContent).not.toContain('↓')
  })

  it('should_sort_ascending_when_total_exertion_header_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /total exertion/i }))
    const cells = screen.getAllByRole('cell')
    const names = cells.filter(c => ['Thunderbolt', 'Shadow', 'Ariel'].includes(c.textContent!))
    expect(names[0].textContent).toBe('Shadow')
    expect(names[1].textContent).toBe('Ariel')
    expect(names[2].textContent).toBe('Thunderbolt')
  })

  it('should_show_up_arrow_after_clicking_active_header', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /total exertion/i }))
    const headers = screen.getAllByRole('columnheader')
    expect(headers[1].textContent).toContain('↑')
    expect(headers[1].textContent).not.toContain('↓')
  })

  it('should_sort_by_jumping_count_descending_when_jumping_header_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /jumping/i }))
    const cells = screen.getAllByRole('cell')
    const names = cells.filter(c => ['Thunderbolt', 'Shadow', 'Ariel'].includes(c.textContent!))
    expect(names[0].textContent).toBe('Shadow')
    expect(names[1].textContent).toBe('Ariel')
    expect(names[2].textContent).toBe('Thunderbolt')
  })

  it('should_sort_by_lesson_count_descending_when_lessons_header_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /lessons/i }))
    const cells = screen.getAllByRole('cell')
    const names = cells.filter(c => ['Thunderbolt', 'Shadow', 'Ariel'].includes(c.textContent!))
    expect(names[0].textContent).toBe('Shadow')
    expect(names[1].textContent).toBe('Thunderbolt')
    expect(names[2].textContent).toBe('Ariel')
  })

  it('should_sort_by_horse_name_ascending_when_horse_header_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /^horse$/i }))
    const cells = screen.getAllByRole('cell')
    const names = cells.filter(c => ['Thunderbolt', 'Shadow', 'Ariel'].includes(c.textContent!))
    expect(names[0].textContent).toBe('Ariel')
    expect(names[1].textContent).toBe('Shadow')
    expect(names[2].textContent).toBe('Thunderbolt')
  })

  it('should_sort_descending_when_ascending_active_header_clicked_again', () => {
    render(<HorseOverviewTable horses={horses} />)
    const btn = screen.getByRole('button', { name: /total exertion/i })
    fireEvent.click(btn) // desc → asc
    fireEvent.click(btn) // asc → desc
    const cells = screen.getAllByRole('cell')
    const names = cells.filter(c => ['Thunderbolt', 'Shadow', 'Ariel'].includes(c.textContent!))
    expect(names[0].textContent).toBe('Thunderbolt')
  })

  it('should_sort_horse_names_descending_when_horse_header_clicked_twice', () => {
    render(<HorseOverviewTable horses={horses} />)
    const btn = screen.getByRole('button', { name: /^horse$/i })
    fireEvent.click(btn) // asc (Ariel first)
    fireEvent.click(btn) // desc (Thunderbolt first)
    const cells = screen.getAllByRole('cell')
    const names = cells.filter(c => ['Thunderbolt', 'Shadow', 'Ariel'].includes(c.textContent!))
    expect(names[0].textContent).toBe('Thunderbolt')
  })

  it('should_render_empty_state_when_no_horses', () => {
    render(<HorseOverviewTable horses={[]} />)
    expect(screen.getByText(/no horses/i)).toBeDefined()
  })
})
