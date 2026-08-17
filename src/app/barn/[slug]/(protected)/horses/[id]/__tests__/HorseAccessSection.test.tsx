import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'

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
    ownerMemberId: null,
    onGrant: vi.fn().mockResolvedValue(undefined),
    onUpdateDocument: vi.fn().mockResolvedValue(undefined),
    onUpdateLesson: vi.fn().mockResolvedValue(undefined),
    onRevoke: vi.fn().mockResolvedValue(undefined),
    onSetOwner: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

/** The FormData a mocked action was called with, as a plain object. */
function submittedFields(mock: ReturnType<typeof vi.fn>, argIndex: number): Record<string, string> {
  const formData = mock.mock.calls[0][argIndex] as FormData
  return Object.fromEntries(formData.entries()) as Record<string, string>
}

/**
 * One document-state button out of a named grant's row. Row-scoped because every row renders the
 * same three labels — the accessible name alone can't tell Dana's Write from Emery's.
 */
function documentButton(grantName: string, label: string): HTMLButtonElement {
  const row = screen.getByText(grantName).closest('tr')!
  return within(row).getByRole('button', { name: label }) as HTMLButtonElement
}

/** A named grant's lesson-schedule switch. */
function lessonSwitch(grantName: string): HTMLButtonElement {
  const row = screen.getByText(grantName).closest('tr')!
  return within(row).getByRole('switch') as HTMLButtonElement
}

/**
 * Every interactive control in the section. `getAllByRole('button')` alone is not it: since #1548
 * the lesson-schedule toggle is `role="switch"`, which that query does not match -- so a sweep
 * written against buttons would silently stop covering the one control that moved.
 */
function everyControl(): HTMLElement[] {
  return [...screen.getAllByRole('button'), ...screen.getAllByRole('switch')]
}

describe('HorseAccessSection', () => {
  it('should_render_a_row_for_each_grant', () => {
    render(<HorseAccessSection {...makeProps()} />)
    expect(screen.getByText('Dana Rider')).toBeDefined()
    expect(screen.getByText('Emery Rider')).toBeDefined()
  })

  it('should_render_empty_state_when_no_grants', () => {
    render(<HorseAccessSection {...makeProps({ grants: [] })} />)
    expect(screen.getByText(/no additional members have been granted access/i)).toBeDefined()
  })

  it('should_render_a_button_for_every_document_state', () => {
    render(<HorseAccessSection {...makeProps()} />)
    const labels = ['None', 'Read', 'Write'].map((label) => documentButton('Dana Rider', label).textContent)
    expect(labels).toEqual(['None', 'Read', 'Write'])
  })

  // The only thing distinguishing the three is which one is pressed, so that state has to be
  // exposed to assistive tech rather than carried by the fill colour alone.
  it('should_mark_only_the_current_document_privilege_as_pressed', () => {
    render(<HorseAccessSection {...makeProps()} />)
    const pressed = ['None', 'Read', 'Write'].map(
      (label) => documentButton('Dana Rider', label).getAttribute('aria-pressed')
    )
    expect(pressed).toEqual(['false', 'true', 'false'])
  })

  // #1548 replaced the Can View/Cannot View label pair with a switch: the label was carrying the
  // state, so there was nothing left saying what the control *was*. The column header names the
  // setting; `aria-checked` and the knob say which way it is thrown.
  it('should_report_lesson_access_off_through_the_switch', () => {
    render(<HorseAccessSection {...makeProps()} />)
    expect(lessonSwitch('Dana Rider').getAttribute('aria-checked')).toBe('false')
  })

  it('should_report_lesson_access_on_through_the_switch', () => {
    render(<HorseAccessSection {...makeProps()} />)
    expect(lessonSwitch('Emery Rider').getAttribute('aria-checked')).toBe('true')
  })

  it('should_name_the_lesson_switch_after_the_member_it_belongs_to', () => {
    render(<HorseAccessSection {...makeProps()} />)
    expect(lessonSwitch('Dana Rider').getAttribute('aria-label')).toBe(
      'Lesson schedule access for Dana Rider'
    )
  })

  it('should_render_add_member_control_when_available_members_exist', () => {
    render(<HorseAccessSection {...makeProps()} />)
    expect(screen.getByRole('option', { name: 'Finley Rider' })).toBeDefined()
  })

  it('should_not_render_add_member_control_when_no_available_members', () => {
    render(<HorseAccessSection {...makeProps({ availableMembers: [] })} />)
    expect(screen.queryByRole('button', { name: /grant access/i })).toBeNull()
  })

  it('should_show_set_as_owner_label_when_grant_is_not_the_owner', () => {
    render(<HorseAccessSection {...makeProps({ ownerMemberId: null })} />)
    expect(screen.getAllByRole('button', { name: /set as owner/i })).toHaveLength(2)
  })

  it('should_show_owner_label_for_the_current_owner_row', () => {
    render(<HorseAccessSection {...makeProps({ ownerMemberId: 'mem-2' })} />)
    expect(screen.getByRole('button', { name: /^owner$/i })).toBeDefined()
    expect(screen.getAllByRole('button', { name: /set as owner/i })).toHaveLength(1)
  })

  // #1390 — every control here was a `<Button type="button" onClick>` with no form action, so
  // each was a silent no-op inside the hydration window: the #1385 defect, four times over, on
  // a page a manager lands on and immediately clicks. Each is now a real form whose action is
  // the Server Function itself (bound, never wrapped in a closure), so the browser can submit
  // it before React has hydrated.
  describe('progressive enhancement', () => {
    it('should_submit_every_control_through_a_form', () => {
      render(<HorseAccessSection {...makeProps()} />)
      const orphans = everyControl().filter((c) => c.closest('form') === null)
      expect(orphans).toEqual([])
    })

    it('should_make_every_control_a_submit_button', () => {
      render(<HorseAccessSection {...makeProps()} />)
      const types = everyControl().map((c) => c.getAttribute('type'))
      expect(new Set(types)).toEqual(new Set(['submit']))
    })

    // The one control that still needed JS to be usable was the document-access `<select>`: its
    // value was unknown at render time, so it took a `FormData` and an `onChange` submit, and it
    // is the one that didn't persist. Three bound buttons carry their value in the action itself,
    // so each is its own form with nothing left to hydrate.
    it('should_give_each_document_state_its_own_form', () => {
      render(<HorseAccessSection {...makeProps()} />)
      const forms = ['None', 'Read', 'Write'].map((label) => documentButton('Dana Rider', label).closest('form'))
      expect(new Set(forms).size).toBe(3)
    })

    it('should_leave_no_select_in_the_grant_rows', () => {
      render(<HorseAccessSection {...makeProps()} />)
      const rowSelects = screen
        .getAllByRole('combobox')
        .filter((c) => c.closest('tbody') !== null)
      expect(rowSelects).toEqual([])
    })
  })

  describe('grant access', () => {
    it('should_call_onGrant_with_the_selected_member_id', () => {
      const onGrant = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onGrant })} />)
      fireEvent.change(screen.getByRole('combobox', { name: /select member/i }), { target: { value: 'mem-3' } })
      fireEvent.click(screen.getByRole('button', { name: /grant access/i }))
      expect(submittedFields(onGrant, 0)).toEqual({ member_id: 'mem-3' })
    })

    // The disabled-until-selected button this replaces was itself broken before hydration —
    // it rendered disabled and nothing ever enabled it. The empty value reaches the server
    // instead, where grantHorseAccessAction returns without granting.
    it('should_not_disable_the_grant_button_before_a_member_is_selected', () => {
      render(<HorseAccessSection {...makeProps()} />)
      expect(screen.getByRole('button', { name: /grant access/i })).toHaveProperty('disabled', false)
    })

    it('should_submit_an_empty_member_id_when_nothing_is_selected', () => {
      const onGrant = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onGrant })} />)
      fireEvent.click(screen.getByRole('button', { name: /grant access/i }))
      expect(submittedFields(onGrant, 0)).toEqual({ member_id: '' })
    })
  })

  describe('document access', () => {
    it('should_call_onUpdateDocument_with_the_privilege_id_and_the_buttons_own_value', () => {
      const onUpdateDocument = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onUpdateDocument })} />)
      fireEvent.click(documentButton('Dana Rider', 'Write'))
      expect(onUpdateDocument.mock.calls[0].slice(0, 2)).toEqual(['privilege-1', 'write'])
    })

    it('should_call_onUpdateDocument_with_none_from_the_none_button', () => {
      const onUpdateDocument = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onUpdateDocument })} />)
      fireEvent.click(documentButton('Dana Rider', 'None'))
      expect(onUpdateDocument.mock.calls[0].slice(0, 2)).toEqual(['privilege-1', 'none'])
    })

    it('should_bind_each_row_to_its_own_privilege_id', () => {
      const onUpdateDocument = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onUpdateDocument })} />)
      fireEvent.click(documentButton('Emery Rider', 'Read'))
      expect(onUpdateDocument.mock.calls[0].slice(0, 2)).toEqual(['privilege-2', 'read'])
    })
  })

  describe('lesson schedule toggle', () => {
    it('should_call_onUpdateLesson_with_the_next_value_bound_at_render_time', () => {
      const onUpdateLesson = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onUpdateLesson })} />)
      fireEvent.click(lessonSwitch('Dana Rider'))
      expect(onUpdateLesson.mock.calls[0].slice(0, 2)).toEqual(['privilege-1', true])
    })

    it('should_bind_false_for_a_grant_that_already_has_the_privilege', () => {
      const onUpdateLesson = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onUpdateLesson })} />)
      fireEvent.click(lessonSwitch('Emery Rider'))
      expect(onUpdateLesson.mock.calls[0].slice(0, 2)).toEqual(['privilege-2', false])
    })
  })

  /**
   * #1548. Three separate buttons read as three actions; joined corners plus one filled segment
   * read as one setting with three values. Still three forms and three submits underneath -- the
   * corners are the only thing that changed, so #1390's pre-hydration guarantee is untouched.
   */
  describe('document access as a segmented group', () => {
    it('should_group_the_three_states_for_assistive_tech', () => {
      render(<HorseAccessSection {...makeProps()} />)
      const row = screen.getByText('Dana Rider').closest('tr')!
      expect(within(row).getByRole('group').getAttribute('aria-label')).toBe('Document access')
    })

    it('should_square_the_inner_edges_of_the_first_segment', () => {
      render(<HorseAccessSection {...makeProps()} />)
      expect(documentButton('Dana Rider', 'None').className).toContain('rounded-r-none')
    })

    it('should_square_both_edges_of_the_middle_segment', () => {
      render(<HorseAccessSection {...makeProps()} />)
      expect(documentButton('Dana Rider', 'Read').className).toContain('rounded-none')
    })

    it('should_square_the_inner_edges_of_the_last_segment', () => {
      render(<HorseAccessSection {...makeProps()} />)
      expect(documentButton('Dana Rider', 'Write').className).toContain('rounded-l-none')
    })

    it('should_fill_only_the_current_segment', () => {
      render(<HorseAccessSection {...makeProps()} />)
      const fills = ['None', 'Read', 'Write'].map((label) =>
        documentButton('Dana Rider', label).className.includes('bg-zinc-900')
      )
      expect(fills).toEqual([false, true, false])
    })
  })

  describe('owner toggle', () => {
    it('should_call_onSetOwner_with_the_member_id_when_set_as_owner_is_clicked', () => {
      const onSetOwner = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onSetOwner, ownerMemberId: null })} />)
      fireEvent.click(screen.getAllByRole('button', { name: /set as owner/i })[0])
      expect(onSetOwner.mock.calls[0][0]).toBe('mem-1')
    })

    it('should_call_onSetOwner_with_null_when_the_current_owner_is_clicked_again', () => {
      const onSetOwner = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onSetOwner, ownerMemberId: 'mem-2' })} />)
      fireEvent.click(screen.getByRole('button', { name: /^owner$/i }))
      expect(onSetOwner.mock.calls[0][0]).toBeNull()
    })
  })

  describe('revoke', () => {
    it('should_call_onRevoke_when_confirmed', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const onRevoke = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onRevoke })} />)
      fireEvent.click(screen.getAllByRole('button', { name: /revoke/i })[0])
      expect(onRevoke.mock.calls[0][0]).toBe('privilege-1')
    })

    it('should_not_call_onRevoke_when_confirm_is_cancelled', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      const onRevoke = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onRevoke })} />)
      fireEvent.click(screen.getAllByRole('button', { name: /revoke/i })[0])
      expect(onRevoke).not.toHaveBeenCalled()
    })

    it('should_name_the_member_in_the_confirm_prompt', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      render(<HorseAccessSection {...makeProps()} />)
      fireEvent.click(screen.getAllByRole('button', { name: /revoke/i })[0])
      expect(confirmSpy).toHaveBeenCalledWith("Revoke Dana Rider's access to this horse?")
    })
  })
})
