import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { HorseAccessSection } from '../HorseAccessSection'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const grants = [
  { id: 'privilege-1', memberId: 'mem-1', name: 'Dana Rider', documentPrivileges: 'read' as const, lessonReadPrivileges: false },
  { id: 'privilege-2', memberId: 'mem-2', name: 'Emery Rider', documentPrivileges: 'none' as const, lessonReadPrivileges: true },
]

const availableMembers = [{ membershipId: 'mem-3', name: 'Finley Rider' }]

function makeProps(overrides: Partial<Parameters<typeof HorseAccessSection>[0]> = {}) {
  return {
    grants,
    availableMembers,
    onGrant: vi.fn().mockResolvedValue(undefined),
    onUpdateDocument: vi.fn().mockResolvedValue(undefined),
    onUpdateLesson: vi.fn().mockResolvedValue(undefined),
    onRevoke: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('HorseAccessSection', () => {
  it('should_render_access_heading', () => {
    render(<HorseAccessSection {...makeProps()} />)
    expect(screen.getByText(/^access$/i)).toBeDefined()
  })

  it('should_render_a_row_for_each_grant', () => {
    render(<HorseAccessSection {...makeProps()} />)
    expect(screen.getByText('Dana Rider')).toBeDefined()
    expect(screen.getByText('Emery Rider')).toBeDefined()
  })

  it('should_render_empty_state_when_no_grants', () => {
    render(<HorseAccessSection {...makeProps({ grants: [] })} />)
    expect(screen.getByText(/no members have been granted access/i)).toBeDefined()
  })

  it('should_reflect_current_document_privileges_in_select', () => {
    render(<HorseAccessSection {...makeProps()} />)
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    const docSelectForDana = selects.find((s) => s.value === 'read')
    expect(docSelectForDana).toBeDefined()
  })

  it('should_call_onUpdateDocument_with_new_value_when_changed', () => {
    const onUpdateDocument = vi.fn().mockResolvedValue(undefined)
    render(<HorseAccessSection {...makeProps({ onUpdateDocument })} />)
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    const docSelectForDana = selects.find((s) => s.value === 'read')!
    fireEvent.change(docSelectForDana, { target: { value: 'write' } })
    expect(onUpdateDocument).toHaveBeenCalledWith('privilege-1', 'write')
  })

  it('should_show_cannot_view_label_when_lesson_read_privileges_is_false', () => {
    render(<HorseAccessSection {...makeProps()} />)
    expect(screen.getByRole('button', { name: /cannot view/i })).toBeDefined()
  })

  it('should_show_can_view_label_when_lesson_read_privileges_is_true', () => {
    render(<HorseAccessSection {...makeProps()} />)
    expect(screen.getByRole('button', { name: /^can view$/i })).toBeDefined()
  })

  it('should_call_onUpdateLesson_with_toggled_value_when_clicked', () => {
    const onUpdateLesson = vi.fn().mockResolvedValue(undefined)
    render(<HorseAccessSection {...makeProps({ onUpdateLesson })} />)
    fireEvent.click(screen.getByRole('button', { name: /cannot view/i }))
    expect(onUpdateLesson).toHaveBeenCalledWith('privilege-1', true)
  })

  it('should_call_onRevoke_when_confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onRevoke = vi.fn().mockResolvedValue(undefined)
    render(<HorseAccessSection {...makeProps({ onRevoke })} />)
    fireEvent.click(screen.getAllByRole('button', { name: /revoke/i })[0])
    expect(onRevoke).toHaveBeenCalledWith('privilege-1')
  })

  it('should_not_call_onRevoke_when_confirm_is_cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onRevoke = vi.fn().mockResolvedValue(undefined)
    render(<HorseAccessSection {...makeProps({ onRevoke })} />)
    fireEvent.click(screen.getAllByRole('button', { name: /revoke/i })[0])
    expect(onRevoke).not.toHaveBeenCalled()
  })

  it('should_render_add_member_control_when_available_members_exist', () => {
    render(<HorseAccessSection {...makeProps()} />)
    expect(screen.getByRole('option', { name: 'Finley Rider' })).toBeDefined()
  })

  it('should_not_render_add_member_control_when_no_available_members', () => {
    render(<HorseAccessSection {...makeProps({ availableMembers: [] })} />)
    expect(screen.queryByRole('button', { name: /grant access/i })).toBeNull()
  })

  it('should_disable_grant_button_until_a_member_is_selected', () => {
    render(<HorseAccessSection {...makeProps()} />)
    expect(screen.getByRole('button', { name: /grant access/i })).toHaveProperty('disabled', true)
  })

  it('should_call_onGrant_with_selected_member_id', () => {
    const onGrant = vi.fn().mockResolvedValue(undefined)
    render(<HorseAccessSection {...makeProps({ onGrant })} />)
    fireEvent.change(screen.getByRole('combobox', { name: /select member/i }), { target: { value: 'mem-3' } })
    fireEvent.click(screen.getByRole('button', { name: /grant access/i }))
    expect(onGrant).toHaveBeenCalledWith('mem-3')
  })
})
