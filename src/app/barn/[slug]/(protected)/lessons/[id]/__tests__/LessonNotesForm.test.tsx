import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { LessonNotesForm } from '../LessonNotesForm'
import {
  NavigationBlockerProvider,
  useNavigationBlocker,
  type PendingNav,
} from '../../../NavigationBlocker'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

import { useRouter } from 'next/navigation'

afterEach(cleanup)

const mockHorse = { exertion_level: 3, horse_notes: 'watch left lead', horses: { id: 'horse-1', name: 'Thunderbolt' } }
const mockRider = { rider_notes: 'good position', private_notes: 'struggling', riders: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } }

const mockAction = vi.fn().mockResolvedValue(undefined)

let pushMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  pushMock = vi.fn()
  vi.mocked(useRouter).mockReturnValue({ push: pushMock } as ReturnType<typeof useRouter>)
})

function NavTrigger({ href = '/other', type = 'push' as 'push' | 'back' } = {}) {
  const { setPendingNav } = useNavigationBlocker()
  const nav: PendingNav = type === 'back' ? { type: 'back' } : { type: 'push', href }
  return (
    <button data-testid="nav-trigger" onClick={() => setPendingNav(nav)} />
  )
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
      <LessonNotesForm action={action} horses={horses} riders={riders} />
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
    const nullRider = { ...mockRider, riders: null }
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
    const nullRider = { ...mockRider, riders: null }
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

  it('should_show_modal_when_pending_nav_is_set_and_dirty', async () => {
    await renderDirty()
    fireEvent.click(screen.getByTestId('nav-trigger'))
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeNull())
  })

  it('should_show_modal_on_popstate_when_dirty', async () => {
    await renderDirty()
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeNull())
  })

  it('should_dismiss_modal_on_cancel', async () => {
    await renderDirty()
    fireEvent.click(screen.getByTestId('nav-trigger'))
    await waitFor(() => screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull())
  })

  it('should_call_action_when_save_changes_clicked', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    await renderDirty(action)
    fireEvent.click(screen.getByTestId('nav-trigger'))
    await waitFor(() => screen.getByRole('button', { name: 'Save changes' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })) })
    expect(action).toHaveBeenCalled()
  })

  it('should_call_router_push_after_save_changes_on_push_nav', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    await renderDirty(action)
    fireEvent.click(screen.getByTestId('nav-trigger'))
    await waitFor(() => screen.getByRole('button', { name: 'Save changes' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })) })
    expect(pushMock).toHaveBeenCalledWith('/other')
  })

  it('should_call_router_push_on_discard_push_nav', async () => {
    await renderDirty()
    fireEvent.click(screen.getByTestId('nav-trigger'))
    await waitFor(() => screen.getByRole('button', { name: 'Discard changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/other'))
  })

  it('should_not_call_action_on_discard', async () => {
    const action = vi.fn()
    await renderDirty(action)
    fireEvent.click(screen.getByTestId('nav-trigger'))
    await waitFor(() => screen.getByRole('button', { name: 'Discard changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(action).not.toHaveBeenCalled()
  })

  it('should_call_history_back_when_discarding_back_nav', async () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await renderDirty()
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => screen.getByRole('button', { name: 'Discard changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(backSpy).toHaveBeenCalled()
  })

  it('should_ignore_popstate_fired_by_history_back_after_discard', async () => {
    vi.spyOn(window.history, 'back').mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await renderDirty()
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => screen.getByRole('button', { name: 'Discard changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull())
  })

  it('should_call_history_back_when_saving_and_leaving_back_nav', async () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    const action = vi.fn().mockResolvedValue(undefined)
    await renderDirty(action)
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => screen.getByRole('button', { name: 'Save changes' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })) })
    expect(backSpy).toHaveBeenCalled()
  })
})
