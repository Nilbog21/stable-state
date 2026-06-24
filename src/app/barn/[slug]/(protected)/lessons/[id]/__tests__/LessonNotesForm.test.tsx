import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { LessonNotesForm } from '../LessonNotesForm'
import {
  NavigationBlockerProvider,
  NavigationConfirmDialog,
  useNavigationBlocker,
  type PendingNav,
} from '../../../NavigationBlocker'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

import { useRouter } from 'next/navigation'

afterEach(cleanup)

const mockHorse = { exertion_level: 3, horse_notes: 'watch left lead', horses: { id: 'horse-1', name: 'Thunderbolt' } }
const mockRider = { rider_notes: 'good position', private_notes: 'struggling', barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } }

const mockAction = vi.fn().mockResolvedValue(undefined)

let pushMock: ReturnType<typeof vi.fn>
let backMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  pushMock = vi.fn()
  backMock = vi.fn()
  vi.mocked(useRouter).mockReturnValue({ push: pushMock, back: backMock } as ReturnType<typeof useRouter>)
})

function NavTrigger({ href = '/other', type = 'push' as 'push' | 'back' } = {}) {
  const { setPendingNav } = useNavigationBlocker()
  const nav: PendingNav = type === 'back' ? { type: 'back' } : { type: 'push', href }
  return (
    <button data-testid="nav-trigger" onClick={() => setPendingNav(nav)} />
  )
}

function MessageDisplay() {
  const { message } = useNavigationBlocker()
  return <div data-testid="message">{message}</div>
}

function OnLeaveDisplay() {
  const { onLeave } = useNavigationBlocker()
  return <div data-testid="onleave">{onLeave ? 'registered' : 'null'}</div>
}

function TestWrapper({
  action = mockAction,
  horses = [mockHorse] as typeof mockHorse[],
  riders = [] as typeof mockRider[],
}: {
  action?: () => Promise<void>
  horses?: typeof mockHorse[]
  riders?: typeof mockRider[]
} = {}) {
  return (
    <NavigationBlockerProvider>
      <NavTrigger />
      <MessageDisplay />
      <OnLeaveDisplay />
      <LessonNotesForm action={action} horses={horses} riders={riders} />
      <NavigationConfirmDialog />
    </NavigationBlockerProvider>
  )
}

async function renderDirty(action = mockAction) {
  render(<TestWrapper action={action} />)
  await act(async () => {
    fireEvent.change(screen.getByDisplayValue('watch left lead'), { target: { value: 'changed' } })
  })
}

describe('LessonNotesForm', () => {
  it('should_render_horse_name_and_exertion', () => {
    render(<TestWrapper />)

    expect(screen.getByText(/Thunderbolt/)).toBeDefined()
  })

  it('should_render_horse_notes_textarea_with_value', () => {
    render(<TestWrapper />)

    expect(screen.getByDisplayValue('watch left lead')).toBeDefined()
  })

  it('should_render_horse_notes_label', () => {
    render(<TestWrapper />)

    expect(screen.getByText('Horse Notes')).toBeDefined()
  })

  it('should_render_rider_name', () => {
    render(
      <NavigationBlockerProvider>
        <NavTrigger />
        <LessonNotesForm action={mockAction} horses={[]} riders={[mockRider]} />
      </NavigationBlockerProvider>
    )

    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_render_rider_notes_textarea_with_value', () => {
    render(
      <NavigationBlockerProvider>
        <NavTrigger />
        <LessonNotesForm action={mockAction} horses={[]} riders={[mockRider]} />
      </NavigationBlockerProvider>
    )

    expect(screen.getByDisplayValue('good position')).toBeDefined()
  })

  it('should_render_private_notes_textarea_with_value', () => {
    render(
      <NavigationBlockerProvider>
        <NavTrigger />
        <LessonNotesForm action={mockAction} horses={[]} riders={[mockRider]} />
      </NavigationBlockerProvider>
    )

    expect(screen.getByDisplayValue('struggling')).toBeDefined()
  })

  it('should_render_private_label', () => {
    render(
      <NavigationBlockerProvider>
        <NavTrigger />
        <LessonNotesForm action={mockAction} horses={[]} riders={[mockRider]} />
      </NavigationBlockerProvider>
    )

    expect(screen.getByText('Private')).toBeDefined()
  })

  it('should_render_save_button', () => {
    render(<TestWrapper />)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined()
  })

  it('should_not_render_horse_form_when_horses_relation_is_null', () => {
    const nullHorse = { ...mockHorse, horses: null }
    render(
      <NavigationBlockerProvider>
        <LessonNotesForm action={mockAction} horses={[nullHorse]} riders={[]} />
      </NavigationBlockerProvider>
    )

    expect(screen.queryByText('Horse Notes')).toBeNull()
  })

  it('should_not_render_rider_form_when_riders_relation_is_null', () => {
    const nullRider = { ...mockRider, barn_membership: null }
    render(
      <NavigationBlockerProvider>
        <LessonNotesForm action={mockAction} horses={[]} riders={[nullRider]} />
      </NavigationBlockerProvider>
    )

    expect(screen.queryByText('Rider Notes')).toBeNull()
  })

  it('should_render_dash_for_null_horse_name', () => {
    const nullHorse = { ...mockHorse, horses: null }
    render(
      <NavigationBlockerProvider>
        <LessonNotesForm action={mockAction} horses={[nullHorse]} riders={[]} />
      </NavigationBlockerProvider>
    )

    expect(screen.getByText('—', { exact: false })).toBeDefined()
  })

  it('should_render_dash_for_null_rider_name', () => {
    const nullRider = { ...mockRider, barn_membership: null }
    render(
      <NavigationBlockerProvider>
        <LessonNotesForm action={mockAction} horses={[]} riders={[nullRider]} />
      </NavigationBlockerProvider>
    )

    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_show_empty_textarea_when_horse_notes_is_null', () => {
    const noNotesHorse = { ...mockHorse, horse_notes: null }
    render(
      <NavigationBlockerProvider>
        <LessonNotesForm action={mockAction} horses={[noNotesHorse]} riders={[]} />
      </NavigationBlockerProvider>
    )

    expect(screen.getByText('Horse Notes')).toBeDefined()
  })

  it('should_add_beforeunload_listener_when_form_changes', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    render(<TestWrapper />)

    fireEvent.change(screen.getByDisplayValue('watch left lead'), { target: { value: 'new notes' } })

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    })
    addSpy.mockRestore()
  })

  it('should_remove_beforeunload_listener_after_submit', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    render(<TestWrapper />)

    fireEvent.change(screen.getByDisplayValue('watch left lead'), { target: { value: 'new notes' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)

    await waitFor(() => {
      expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    })
    removeSpy.mockRestore()
  })

  it('should_call_action_on_submit', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    render(<TestWrapper action={action} />)

    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)

    await waitFor(() => {
      expect(action).toHaveBeenCalled()
    })
  })

  it('should_prevent_default_on_beforeunload_when_dirty', async () => {
    render(<TestWrapper />)

    fireEvent.change(screen.getByDisplayValue('watch left lead'), { target: { value: 'new notes' } })

    await waitFor(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    })
  })
})

describe('LessonNotesForm - navigation guard', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should_set_message_in_context_when_dirty', async () => {
    await renderDirty()
    await waitFor(() => expect(screen.getByTestId('message').textContent).toBe(
      'You have unsaved changes. Stay to save them, or leave without saving.'
    ))
  })

  it('should_clear_message_in_context_after_submit', async () => {
    await renderDirty()
    await waitFor(() => expect(screen.getByTestId('message').textContent).not.toBe(''))
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
    await waitFor(() => expect(screen.getByTestId('message').textContent).toBe(''))
  })

  it('should_show_confirm_dialog_when_nav_triggered_while_dirty', async () => {
    await renderDirty()
    fireEvent.click(screen.getByTestId('nav-trigger'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeNull())
  })

  it('should_set_pendingNav_back_on_popstate_when_dirty', async () => {
    await renderDirty()
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeNull())
  })

  it('should_dismiss_dialog_on_stay_click', async () => {
    await renderDirty()
    fireEvent.click(screen.getByTestId('nav-trigger'))
    await waitFor(() => screen.getByRole('button', { name: /stay/i }))
    fireEvent.click(screen.getByRole('button', { name: /stay/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('should_register_onLeave_when_pending_nav_set', async () => {
    await renderDirty()
    fireEvent.click(screen.getByTestId('nav-trigger'))
    await waitFor(() => expect(screen.getByTestId('onleave').textContent).toBe('registered'))
  })

  it('should_call_router_push_via_onLeave_on_leave_click', async () => {
    await renderDirty()
    fireEvent.click(screen.getByTestId('nav-trigger'))
    await waitFor(() => screen.getByRole('button', { name: /leave/i }))
    fireEvent.click(screen.getByRole('button', { name: /leave/i }))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/other'))
  })

  it('should_call_history_back_via_onLeave_on_popstate_leave', async () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    await renderDirty()
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => screen.getByRole('button', { name: /leave/i }))
    fireEvent.click(screen.getByRole('button', { name: /leave/i }))
    expect(backSpy).toHaveBeenCalled()
  })

  it('should_ignore_popstate_triggered_by_history_back_via_onLeave', async () => {
    vi.spyOn(window.history, 'back').mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await renderDirty()
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => screen.getByRole('button', { name: /leave/i }))
    fireEvent.click(screen.getByRole('button', { name: /leave/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
