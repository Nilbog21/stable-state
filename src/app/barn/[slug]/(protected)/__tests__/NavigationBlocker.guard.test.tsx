import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { NavigationBlockerProvider, useNavigationBlocker, useUnsavedChangesGuard, GuardedForm } from '../NavigationBlocker'
import { DirtyProbe, withBlocker } from '@/test/navigation-blocker-harness'

afterEach(cleanup)

function Guard({ dirty }: { dirty: boolean }) {
  useUnsavedChangesGuard(dirty)
  return null
}

function MessageProbe() {
  const { message } = useNavigationBlocker()
  return <div data-testid="message">{message}</div>
}

describe('useUnsavedChangesGuard', () => {
  it('should_arm_context_dirty_when_dirty_is_true', () => {
    render(withBlocker(<Guard dirty={true} />))
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  it('should_not_arm_context_dirty_when_dirty_is_false', () => {
    render(withBlocker(<Guard dirty={false} />))
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_set_unsaved_changes_message_when_dirty', () => {
    render(
      <NavigationBlockerProvider>
        <MessageProbe />
        <Guard dirty={true} />
      </NavigationBlockerProvider>
    )
    expect(screen.getByTestId('message').textContent).toBe('You have unsaved changes. Leave without saving?')
  })

  it('should_clear_context_dirty_when_guarded_component_unmounts', () => {
    const { rerender } = render(
      <NavigationBlockerProvider>
        <DirtyProbe />
        <Guard dirty={true} />
      </NavigationBlockerProvider>
    )
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
    rerender(
      <NavigationBlockerProvider>
        <DirtyProbe />
      </NavigationBlockerProvider>
    )
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_add_beforeunload_listener_when_dirty', () => {
    const addEventSpy = vi.spyOn(window, 'addEventListener')
    render(withBlocker(<Guard dirty={true} />))
    expect(addEventSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    addEventSpy.mockRestore()
  })

  it('should_not_add_beforeunload_listener_when_clean', () => {
    const addEventSpy = vi.spyOn(window, 'addEventListener')
    render(withBlocker(<Guard dirty={false} />))
    expect(addEventSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function))
    addEventSpy.mockRestore()
  })

  it('should_remove_beforeunload_listener_when_dirty_clears', () => {
    const removeEventSpy = vi.spyOn(window, 'removeEventListener')
    const { rerender } = render(withBlocker(<Guard dirty={true} />))
    rerender(withBlocker(<Guard dirty={false} />))
    expect(removeEventSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    removeEventSpy.mockRestore()
  })

  it('should_prevent_default_on_beforeunload_when_dirty', () => {
    render(withBlocker(<Guard dirty={true} />))
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('GuardedForm', () => {
  const action = vi.fn(async () => {})

  it('should_start_clean', () => {
    render(
      withBlocker(
        <GuardedForm action={action}>
          <input name="name" aria-label="Name" />
        </GuardedForm>
      )
    )
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_arm_dirty_when_a_child_input_changes', () => {
    render(
      withBlocker(
        <GuardedForm action={action}>
          <input name="name" aria-label="Name" />
        </GuardedForm>
      )
    )
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Clover' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  it('should_arm_dirty_when_a_child_select_changes', () => {
    render(
      withBlocker(
        <GuardedForm action={action}>
          <select name="tz" aria-label="Timezone" defaultValue="a">
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
        </GuardedForm>
      )
    )
    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'b' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  it('should_clear_dirty_on_submit', async () => {
    render(
      withBlocker(
        <GuardedForm action={action}>
          <input name="name" aria-label="Name" />
          <button type="submit">Save</button>
        </GuardedForm>
      )
    )
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Clover' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
    })
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_pass_className_through_to_the_form', () => {
    render(
      withBlocker(
        <GuardedForm action={action} className="flex gap-2">
          <input name="name" aria-label="Name" />
        </GuardedForm>
      )
    )
    expect((screen.getByLabelText('Name').closest('form') as HTMLFormElement).className).toBe('flex gap-2')
  })
})
