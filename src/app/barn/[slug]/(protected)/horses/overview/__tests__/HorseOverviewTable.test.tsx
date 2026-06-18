import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { HorseOverviewTable } from '../HorseOverviewTable'

afterEach(cleanup)

const horses = [
  { id: 'horse-1', name: 'Thunderbolt', lessonCount: 3, totalExertion: 12, jumpingCount: 1 },
  { id: 'horse-2', name: 'Shadow', lessonCount: 5, totalExertion: 4, jumpingCount: 3 },
  { id: 'horse-3', name: 'Ariel', lessonCount: 2, totalExertion: 8, jumpingCount: 2 },
]

function getNameCells() {
  return screen.getAllByRole('cell').filter(c => ['Thunderbolt', 'Shadow', 'Ariel'].includes(c.textContent!))
}

describe('HorseOverviewTable', () => {
  it('should_render_thunderbolt', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
  })

  it('should_render_shadow', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getByText('Shadow')).toBeDefined()
  })

  it('should_render_ariel', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getByText('Ariel')).toBeDefined()
  })

  it('should_render_horse_as_first_column_header', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getAllByRole('columnheader')[0].textContent).toContain('Horse')
  })

  it('should_render_total_exertion_as_second_column_header', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getAllByRole('columnheader')[1].textContent).toContain('Total Exertion (7d)')
  })

  it('should_render_jumping_as_third_column_header', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getAllByRole('columnheader')[2].textContent).toContain('# Jumping (7d)')
  })

  it('should_render_lessons_as_fourth_column_header', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getAllByRole('columnheader')[3].textContent).toContain('Lessons (7d)')
  })

  it('should_render_highest_exertion_horse_first_by_default', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(getNameCells()[0].textContent).toBe('Thunderbolt')
  })

  it('should_render_second_highest_exertion_horse_second_by_default', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(getNameCells()[1].textContent).toBe('Ariel')
  })

  it('should_render_lowest_exertion_horse_last_by_default', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(getNameCells()[2].textContent).toBe('Shadow')
  })

  it('should_show_down_arrow_on_total_exertion_column_by_default', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getAllByRole('columnheader')[1].textContent).toContain('▼')
  })

  it('should_show_no_arrow_on_horse_column_by_default', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getAllByRole('columnheader')[0].textContent).not.toMatch(/[▲▼]/)
  })

  it('should_show_no_arrow_on_jumping_column_by_default', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getAllByRole('columnheader')[2].textContent).not.toMatch(/[▲▼]/)
  })

  it('should_show_no_arrow_on_lessons_column_by_default', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getAllByRole('columnheader')[3].textContent).not.toMatch(/[▲▼]/)
  })

  it('should_set_aria_sort_descending_on_total_exertion_by_default', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getAllByRole('columnheader')[1].getAttribute('aria-sort')).toBe('descending')
  })

  it('should_set_aria_sort_none_on_inactive_column_by_default', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getAllByRole('columnheader')[0].getAttribute('aria-sort')).toBe('none')
  })

  it('should_render_lowest_exertion_horse_first_when_total_exertion_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /total exertion/i }))
    expect(getNameCells()[0].textContent).toBe('Shadow')
  })

  it('should_render_middle_exertion_horse_second_when_total_exertion_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /total exertion/i }))
    expect(getNameCells()[1].textContent).toBe('Ariel')
  })

  it('should_render_highest_exertion_horse_last_when_total_exertion_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /total exertion/i }))
    expect(getNameCells()[2].textContent).toBe('Thunderbolt')
  })

  it('should_show_up_arrow_on_total_exertion_after_clicking_active_header', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /total exertion/i }))
    expect(screen.getAllByRole('columnheader')[1].textContent).toContain('▲')
  })

  it('should_not_show_down_arrow_on_total_exertion_after_clicking_active_header', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /total exertion/i }))
    expect(screen.getAllByRole('columnheader')[1].textContent).not.toContain('▼')
  })

  it('should_render_highest_jumping_horse_first_when_jumping_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /jumping/i }))
    expect(getNameCells()[0].textContent).toBe('Shadow')
  })

  it('should_render_middle_jumping_horse_second_when_jumping_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /jumping/i }))
    expect(getNameCells()[1].textContent).toBe('Ariel')
  })

  it('should_render_lowest_jumping_horse_last_when_jumping_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /jumping/i }))
    expect(getNameCells()[2].textContent).toBe('Thunderbolt')
  })

  it('should_render_highest_lesson_count_horse_first_when_lessons_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /lessons/i }))
    expect(getNameCells()[0].textContent).toBe('Shadow')
  })

  it('should_render_middle_lesson_count_horse_second_when_lessons_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /lessons/i }))
    expect(getNameCells()[1].textContent).toBe('Thunderbolt')
  })

  it('should_render_lowest_lesson_count_horse_last_when_lessons_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /lessons/i }))
    expect(getNameCells()[2].textContent).toBe('Ariel')
  })

  it('should_render_first_alphabetical_horse_first_when_name_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /^horse$/i }))
    expect(getNameCells()[0].textContent).toBe('Ariel')
  })

  it('should_render_second_alphabetical_horse_second_when_name_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /^horse$/i }))
    expect(getNameCells()[1].textContent).toBe('Shadow')
  })

  it('should_render_last_alphabetical_horse_last_when_name_clicked', () => {
    render(<HorseOverviewTable horses={horses} />)
    fireEvent.click(screen.getByRole('button', { name: /^horse$/i }))
    expect(getNameCells()[2].textContent).toBe('Thunderbolt')
  })

  it('should_render_highest_exertion_horse_first_when_ascending_active_header_clicked_again', () => {
    render(<HorseOverviewTable horses={horses} />)
    const btn = screen.getByRole('button', { name: /total exertion/i })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(getNameCells()[0].textContent).toBe('Thunderbolt')
  })

  it('should_render_last_alphabetical_horse_first_when_name_header_clicked_twice', () => {
    render(<HorseOverviewTable horses={horses} />)
    const btn = screen.getByRole('button', { name: /^horse$/i })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(getNameCells()[0].textContent).toBe('Thunderbolt')
  })

  it('should_render_empty_state_text_when_no_horses', () => {
    render(<HorseOverviewTable horses={[]} />)
    expect(screen.getByText(/no horses/i)).toBeDefined()
  })

  it('should_not_render_sort_buttons_when_no_horses', () => {
    render(<HorseOverviewTable horses={[]} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
