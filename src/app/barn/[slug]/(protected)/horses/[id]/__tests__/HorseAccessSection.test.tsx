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

/**
 * The default owner is a member with no grant of their own — the ordinary case since #1549, because
 * `createHorse` makes the creating manager the owner and never writes them a privileges row. A
 * horse whose owner *does* hold a grant is the `ownerHoldsAGrant` block below.
 */
const owner = { memberId: 'mem-owner', name: 'Alex Manager' }

function makeProps(overrides: Partial<Parameters<typeof HorseAccessSection>[0]> = {}) {
  return {
    grants,
    availableMembers,
    owner,
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

function row(memberName: string): HTMLElement {
  return screen.getByText(memberName).closest('tr')!
}

/**
 * One radio out of a named member's row. Row-scoped because every row renders the same option
 * labels — the accessible name alone can't tell Dana's Write from Emery's.
 */
function radio(memberName: string, label: string | RegExp): HTMLButtonElement {
  return within(row(memberName)).getByRole('radio', { name: label }) as HTMLButtonElement
}

/** A named member's lesson-schedule switch. */
function lessonSwitch(memberName: string): HTMLButtonElement {
  return within(row(memberName)).getByRole('switch') as HTMLButtonElement
}

/**
 * Every interactive control in the section. `getAllByRole('button')` alone is not it: the
 * lesson-schedule toggle is `role="switch"` (#1548) and the owner and document controls are
 * `role="radio"` (#1549), neither of which that query matches — so a sweep written against buttons
 * would silently stop covering the controls that moved.
 */
function everyControl(): HTMLElement[] {
  return [...screen.getAllByRole('button'), ...screen.getAllByRole('switch'), ...screen.getAllByRole('radio')]
}

describe('HorseAccessSection', () => {
  it('should_render_a_row_for_each_grant', () => {
    render(<HorseAccessSection {...makeProps()} />)
    expect(screen.getByText('Dana Rider')).toBeDefined()
    expect(screen.getByText('Emery Rider')).toBeDefined()
  })

  /**
   * #1549: `horses.owning_member_id` is NOT NULL, so there is always an owner — but the owner is
   * only in `member_horse_privileges` if a manager granted them access separately. Without a
   * synthesised row the Owner column would be a single-select with nothing selected, on the
   * majority of horses.
   */
  describe('the owner always has a row', () => {
    it('should_render_a_row_for_an_owner_who_holds_no_grant', () => {
      render(<HorseAccessSection {...makeProps()} />)
      expect(screen.getByText('Alex Manager')).toBeDefined()
    })

    it('should_put_the_owner_row_first', () => {
      render(<HorseAccessSection {...makeProps()} />)
      const names = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td')!.textContent)
      expect(names).toEqual(['Alex Manager', 'Dana Rider', 'Emery Rider'])
    })

    it('should_mark_the_owner_row_as_the_selected_owner', () => {
      render(<HorseAccessSection {...makeProps()} />)
      expect(radio('Alex Manager', 'Owner').getAttribute('aria-checked')).toBe('true')
    })

    it('should_offer_set_as_owner_on_every_other_row', () => {
      render(<HorseAccessSection {...makeProps()} />)
      expect(screen.getAllByRole('radio', { name: 'Set as Owner' })).toHaveLength(2)
    })

    // Deduped, not doubled: an owner who also holds a privileges row is one member and gets one row.
    describe('when the owner also holds a grant', () => {
      const props = { owner: { memberId: 'mem-2', name: 'Emery Rider' } }

      it('should_not_duplicate_the_owners_row', () => {
        render(<HorseAccessSection {...makeProps(props)} />)
        expect(screen.getAllByText('Emery Rider')).toHaveLength(1)
      })

      it('should_render_one_row_per_member', () => {
        render(<HorseAccessSection {...makeProps(props)} />)
        expect(screen.getAllByRole('row').slice(1)).toHaveLength(2)
      })

      it('should_still_put_the_owner_first', () => {
        render(<HorseAccessSection {...makeProps(props)} />)
        const names = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td')!.textContent)
        expect(names).toEqual(['Emery Rider', 'Dana Rider'])
      })
    })
  })

  it('should_render_a_radio_for_every_document_state', () => {
    render(<HorseAccessSection {...makeProps()} />)
    const labels = ['None', 'Read', 'Write'].map((label) => radio('Dana Rider', label).textContent)
    expect(labels).toEqual(['None', 'Read', 'Write'])
  })

  it('should_check_only_the_current_document_privilege', () => {
    render(<HorseAccessSection {...makeProps()} />)
    const checked = ['None', 'Read', 'Write'].map(
      (label) => radio('Dana Rider', label).getAttribute('aria-checked')
    )
    expect(checked).toEqual(['false', 'true', 'false'])
  })

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

  // The table renders even with no grants at all, because the owner row is always there — so the
  // empty state this section used to have has nothing left to describe.
  it('should_render_the_table_when_the_owner_is_the_only_row', () => {
    render(<HorseAccessSection {...makeProps({ grants: [] })} />)
    expect(radio('Alex Manager', 'Owner').getAttribute('aria-checked')).toBe('true')
  })

  /**
   * #1547: ownership confers document write and lesson read through `auth_is_horse_owner`, whatever
   * the row stores — so on the owner's row these two controls governed nothing and displayed a state
   * the DB would ignore. Effective values as plain cells instead. Emery (`mem-2`) is the owner in
   * this block and holds `documentPrivileges: 'none'`, which is the divergence itself.
   */
  describe('the owner row shows effective access rather than the stored grant', () => {
    const props = { owner: { memberId: 'mem-2', name: 'Emery Rider' } }

    it('should_not_render_document_radios_on_the_owner_row', () => {
      render(<HorseAccessSection {...makeProps(props)} />)
      const labels = ['None', 'Read', 'Write'].map((label) =>
        within(row('Emery Rider')).queryByRole('radio', { name: label })
      )
      expect(labels).toEqual([null, null, null])
    })

    // Read as the tag carrying the text, not as the text's presence: 'Write' is inside a control
    // both before and after this change, so a bare `getByText` would pass on the thing it exists to
    // have replaced. `getNodeText` matches an element's own text nodes, so the cell only answers
    // here once the control between them is gone.
    it('should_render_write_as_text_on_the_owner_row', () => {
      render(<HorseAccessSection {...makeProps(props)} />)
      expect(within(row('Emery Rider')).getByText('Write').tagName).toBe('TD')
    })

    it('should_not_render_a_lesson_toggle_on_the_owner_row', () => {
      render(<HorseAccessSection {...makeProps(props)} />)
      expect(within(row('Emery Rider')).queryByRole('switch')).toBeNull()
    })

    it('should_render_can_view_as_text_on_the_owner_row', () => {
      render(<HorseAccessSection {...makeProps(props)} />)
      expect(within(row('Emery Rider')).getByText('Can View').tagName).toBe('TD')
    })

    /**
     * #1549: Revoke used to clear `owning_member_id` alongside the privileges row, which is how a
     * manager unset an owner. The column is NOT NULL now, so `revoke_horse_privilege` no longer
     * touches it — revoking here would delete the grant and leave the row on screen unchanged,
     * a button that visibly does nothing. Ownership moves by picking a different row instead.
     */
    it('should_not_offer_revoke_on_the_owner_row', () => {
      render(<HorseAccessSection {...makeProps(props)} />)
      expect(within(row('Emery Rider')).queryByRole('button', { name: /revoke/i })).toBeNull()
    })

    it('should_not_offer_revoke_on_an_owner_row_with_no_grant_behind_it', () => {
      render(<HorseAccessSection {...makeProps()} />)
      expect(within(row('Alex Manager')).queryByRole('button', { name: /revoke/i })).toBeNull()
    })

    // The non-owner rows are the reason those controls still exist at all, so their survival is
    // asserted rather than assumed — Dana keeps her stored 'read' as a live, checked control.
    it('should_keep_the_document_radios_on_a_non_owner_row', () => {
      render(<HorseAccessSection {...makeProps(props)} />)
      expect(radio('Dana Rider', 'Read').getAttribute('aria-checked')).toBe('true')
    })

    it('should_keep_revoke_on_a_non_owner_row', () => {
      render(<HorseAccessSection {...makeProps(props)} />)
      expect(within(row('Dana Rider')).getByRole('button', { name: /revoke/i })).toBeDefined()
    })

    // Always, now — there is always an owner row for it to describe.
    it('should_explain_the_owner_row', () => {
      render(<HorseAccessSection {...makeProps()} />)
      expect(screen.getByText(/comes from owning the horse/i)).toBeDefined()
    })

    // The caption used to end "Unset the owner to edit their access as an ordinary grant", which is
    // no longer an available move.
    it('should_not_tell_the_manager_to_unset_the_owner', () => {
      render(<HorseAccessSection {...makeProps()} />)
      expect(screen.queryByText(/unset the owner/i)).toBeNull()
    })
  })

  // #1390 — every control here was a `<Button type="button" onClick>` with no form action, so
  // each was a silent no-op inside the hydration window, on a page a manager lands on and
  // immediately clicks. Each is now a real form whose action is the Server Function itself
  // (bound, never wrapped in a closure), so the browser can submit it before React has hydrated.
  // #1549's radios keep that property precisely by *not* being `<input type="radio">`.
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
    // is the one that didn't persist. Three bound radios carry their value in the action itself,
    // so each is its own form with nothing left to hydrate.
    it('should_give_each_document_state_its_own_form', () => {
      render(<HorseAccessSection {...makeProps()} />)
      const forms = ['None', 'Read', 'Write'].map((label) => radio('Dana Rider', label).closest('form'))
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
    it('should_call_onUpdateDocument_with_the_privilege_id_and_the_radios_own_value', () => {
      const onUpdateDocument = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onUpdateDocument })} />)
      fireEvent.click(radio('Dana Rider', 'Write'))
      expect(onUpdateDocument.mock.calls[0].slice(0, 2)).toEqual(['privilege-1', 'write'])
    })

    it('should_call_onUpdateDocument_with_none_from_the_none_radio', () => {
      const onUpdateDocument = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onUpdateDocument })} />)
      fireEvent.click(radio('Dana Rider', 'None'))
      expect(onUpdateDocument.mock.calls[0].slice(0, 2)).toEqual(['privilege-1', 'none'])
    })

    it('should_bind_each_row_to_its_own_privilege_id', () => {
      const onUpdateDocument = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onUpdateDocument })} />)
      fireEvent.click(radio('Emery Rider', 'Read'))
      expect(onUpdateDocument.mock.calls[0].slice(0, 2)).toEqual(['privilege-2', 'read'])
    })

    /**
     * #1549. Three loose buttons read as three actions and #1548's joined strip read as one setting
     * with three values, but neither said *single-select* the way the platform's own idiom does.
     * Still three forms and three submits underneath — the vocabulary changed, not the plumbing.
     */
    it('should_group_the_three_states_for_assistive_tech', () => {
      render(<HorseAccessSection {...makeProps()} />)
      expect(within(row('Dana Rider')).getByRole('radiogroup').getAttribute('aria-label')).toBe(
        'Document access for Dana Rider'
      )
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
   * The owner radios are a single-select spread down a table *column*, so there is no element to
   * carry `role="radiogroup"` — a group can't span rows without `aria-owns`, which is worse than
   * the `<th>Owner</th>` that already names the setting. Each radio still announces as a radio with
   * its own checked state, inside a row that names the member.
   */
  describe('owner radio', () => {
    it('should_call_onSetOwner_with_the_member_id_when_set_as_owner_is_picked', () => {
      const onSetOwner = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onSetOwner })} />)
      fireEvent.click(radio('Dana Rider', 'Set as Owner'))
      expect(onSetOwner.mock.calls[0][0]).toBe('mem-1')
    })

    /**
     * #1549: ownership transfers, never clears. Picking the already-selected owner is what a native
     * radio does on a re-tap — it stays selected — so this binds the owner's own id and the RPC's
     * write is a no-op, rather than the null that used to leave the horse unowned.
     */
    it('should_rebind_the_current_owner_to_themselves_rather_than_to_null', () => {
      const onSetOwner = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onSetOwner })} />)
      fireEvent.click(radio('Alex Manager', 'Owner'))
      expect(onSetOwner.mock.calls[0][0]).toBe('mem-owner')
    })
  })

  describe('revoke', () => {
    it('should_call_onRevoke_when_confirmed', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const onRevoke = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onRevoke })} />)
      fireEvent.click(within(row('Dana Rider')).getByRole('button', { name: /revoke/i }))
      expect(onRevoke.mock.calls[0][0]).toBe('privilege-1')
    })

    it('should_not_call_onRevoke_when_confirm_is_cancelled', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      const onRevoke = vi.fn().mockResolvedValue(undefined)
      render(<HorseAccessSection {...makeProps({ onRevoke })} />)
      fireEvent.click(within(row('Dana Rider')).getByRole('button', { name: /revoke/i }))
      expect(onRevoke).not.toHaveBeenCalled()
    })

    it('should_name_the_member_in_the_confirm_prompt', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      render(<HorseAccessSection {...makeProps()} />)
      fireEvent.click(within(row('Dana Rider')).getByRole('button', { name: /revoke/i }))
      expect(confirmSpy).toHaveBeenCalledWith("Revoke Dana Rider's access to this horse?")
    })
  })
})
