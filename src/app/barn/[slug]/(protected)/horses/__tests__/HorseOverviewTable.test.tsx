import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { HorseOverviewTable } from '../HorseOverviewTable'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const horses = [
  { id: 'horse-1', name: 'Thunderbolt', is_active: true, lessonCount: 3, totalExertion: 12, jumpingCount: 1 },
  { id: 'horse-2', name: 'Shadow', is_active: true, lessonCount: 5, totalExertion: 4, jumpingCount: 3 },
  { id: 'horse-3', name: 'Ariel', is_active: true, lessonCount: 2, totalExertion: 8, jumpingCount: 2 },
]

const inactiveHorse = { id: 'horse-4', name: 'Retired', is_active: false, lessonCount: 0, totalExertion: 0, jumpingCount: 0 }

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

  it('should_render_static_name_when_not_manager', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.getByText('Thunderbolt').tagName).not.toBe('INPUT')
  })

  it('should_render_name_input_when_manager', () => {
    render(<HorseOverviewTable horses={horses} isManager />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('should_render_save_button_when_manager', () => {
    render(<HorseOverviewTable horses={horses} isManager />)
    expect(screen.getAllByRole('button', { name: /save/i }).length).toBeGreaterThan(0)
  })

  it('should_not_render_save_button_when_not_manager', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.queryAllByRole('button', { name: /save/i })).toHaveLength(0)
  })

  it('should_associate_input_with_update_form_when_manager', () => {
    render(<HorseOverviewTable horses={[horses[0]]} isManager />)
    const input = screen.getByRole('textbox')
    expect(input.getAttribute('form')).toBe('update-horse-horse-1')
  })

  it('should_render_set_inactive_button_for_active_horse_when_manager', () => {
    render(<HorseOverviewTable horses={horses} isManager />)
    expect(screen.getAllByRole('button', { name: /set inactive/i }).length).toBeGreaterThan(0)
  })

  it('should_not_render_set_inactive_button_when_not_manager', () => {
    render(<HorseOverviewTable horses={horses} />)
    expect(screen.queryAllByRole('button', { name: /set inactive/i })).toHaveLength(0)
  })

  it('should_call_window_confirm_when_set_inactive_clicked', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<HorseOverviewTable horses={[horses[0]]} isManager />)

    fireEvent.click(screen.getByRole('button', { name: /set inactive/i }))

    expect(window.confirm).toHaveBeenCalledWith('Set Thunderbolt inactive?')
  })

  it('should_not_submit_when_confirm_is_cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const mockRequestSubmit = vi.fn()
    vi.spyOn(document, 'getElementById').mockReturnValue({ requestSubmit: mockRequestSubmit } as any)
    render(<HorseOverviewTable horses={[horses[0]]} isManager />)

    fireEvent.click(screen.getByRole('button', { name: /set inactive/i }))

    expect(mockRequestSubmit).not.toHaveBeenCalled()
  })

  it('should_call_getElementById_with_toggle_form_id_when_confirm_is_accepted', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(document, 'getElementById').mockReturnValue({ requestSubmit: vi.fn() } as any)
    render(<HorseOverviewTable horses={[horses[0]]} isManager />)

    fireEvent.click(screen.getByRole('button', { name: /set inactive/i }))

    expect(document.getElementById).toHaveBeenCalledWith('toggle-horse-horse-1')
  })

  it('should_call_requestSubmit_when_confirm_is_accepted', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const mockRequestSubmit = vi.fn()
    vi.spyOn(document, 'getElementById').mockReturnValue({ requestSubmit: mockRequestSubmit } as any)
    render(<HorseOverviewTable horses={[horses[0]]} isManager />)

    fireEvent.click(screen.getByRole('button', { name: /set inactive/i }))

    expect(mockRequestSubmit).toHaveBeenCalledOnce()
  })

  it('should_render_inactive_badge_for_inactive_horse_when_manager', () => {
    render(<HorseOverviewTable horses={[inactiveHorse]} isManager />)
    expect(screen.getByText('Inactive')).toBeDefined()
  })

  it('should_render_inactive_badge_for_inactive_horse_when_not_manager', () => {
    render(<HorseOverviewTable horses={[inactiveHorse]} />)
    expect(screen.getByText('Inactive')).toBeDefined()
  })

  it('should_not_render_inactive_badge_for_active_horse', () => {
    render(<HorseOverviewTable horses={[horses[0]]} />)
    expect(screen.queryByText('Inactive')).toBeNull()
  })

  it('should_render_set_active_button_for_inactive_horse_when_manager', () => {
    render(<HorseOverviewTable horses={[inactiveHorse]} isManager />)
    expect(screen.getByRole('button', { name: /set active/i })).toBeDefined()
  })

  it('should_not_render_set_inactive_button_for_inactive_horse', () => {
    render(<HorseOverviewTable horses={[inactiveHorse]} isManager />)
    expect(screen.queryByRole('button', { name: /set inactive/i })).toBeNull()
  })

  it('should_call_getElementById_with_toggle_form_id_when_set_active_clicked', () => {
    vi.spyOn(document, 'getElementById').mockReturnValue({ requestSubmit: vi.fn() } as any)
    render(<HorseOverviewTable horses={[inactiveHorse]} isManager />)

    fireEvent.click(screen.getByRole('button', { name: /set active/i }))

    expect(document.getElementById).toHaveBeenCalledWith('toggle-horse-horse-4')
  })

  it('should_call_requestSubmit_when_set_active_clicked', () => {
    const mockRequestSubmit = vi.fn()
    vi.spyOn(document, 'getElementById').mockReturnValue({ requestSubmit: mockRequestSubmit } as any)
    render(<HorseOverviewTable horses={[inactiveHorse]} isManager />)

    fireEvent.click(screen.getByRole('button', { name: /set active/i }))

    expect(mockRequestSubmit).toHaveBeenCalledOnce()
  })

  it('should_not_call_confirm_when_set_active_clicked', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(document, 'getElementById').mockReturnValue({ requestSubmit: vi.fn() } as any)
    render(<HorseOverviewTable horses={[inactiveHorse]} isManager />)

    fireEvent.click(screen.getByRole('button', { name: /set active/i }))

    expect(window.confirm).not.toHaveBeenCalled()
  })
})
