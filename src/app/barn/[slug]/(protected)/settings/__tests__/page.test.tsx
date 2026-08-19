import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockLessonTier, createMockBarnEvent } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))
vi.mock('@/lib/db/lesson-tiers', () => ({ getAllTiersByBarn: vi.fn() }))
vi.mock('@/lib/db/barn-events', () => ({ getEventsByBarn: vi.fn() }))
vi.mock('@/lib/db/document-backup', () => ({ getAllBarnDocuments: vi.fn() }))
vi.mock('../actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../actions')>()
  return {
    ...actual,
    downloadAllDocumentsAction: vi.fn(),
    downloadBarnDataAction: vi.fn(),
  }
})
const mockNotFound = vi.hoisted(() =>
  vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
)
const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url}`,
    })
  })
)
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getAllTiersByBarn } from '@/lib/db/lesson-tiers'
import { getEventsByBarn } from '@/lib/db/barn-events'
import { getAllBarnDocuments } from '@/lib/db/document-backup'
import { downloadAllDocumentsAction, downloadBarnDataAction } from '../actions'
import SettingsPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getAllTiersByBarn).mockReset()
    vi.mocked(getEventsByBarn).mockReset()
    vi.mocked(getAllBarnDocuments).mockReset()
    vi.mocked(downloadAllDocumentsAction).mockReset()
    vi.mocked(downloadBarnDataAction).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getAllTiersByBarn).mockResolvedValue([])
    vi.mocked(getEventsByBarn).mockResolvedValue([])
    vi.mocked(getAllBarnDocuments).mockResolvedValue({ horse: [], trainer: [], rider: [] })
    vi.mocked(downloadAllDocumentsAction).mockResolvedValue({ error: null, url: null })
    vi.mocked(downloadBarnDataAction).mockResolvedValue({ error: null, url: null })
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(
      SettingsPage({ params: Promise.resolve({ slug: 'unknown' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_user_is_not_authenticated', async () => {
    setupAuth(null)

    await expect(
      SettingsPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_user_is_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)

    await expect(
      SettingsPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_render_manage_barn_heading', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Manage Barn')
  })

  it('should_render_tier_name_as_text_in_list', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('Standard')).toBeDefined()
  })

  it('should_render_active_status_for_active_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('Active')).toBeDefined()
  })

  it('should_render_inactive_status_for_inactive_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-2', name: 'Premium', is_active: false }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('Inactive')).toBeDefined()
  })

  it('should_render_default_badge_for_default_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_default: true }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getAllByText('Default').length).toBe(2)
  })

  it('should_render_dollar_price_when_tier_price_is_set', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', price: 50 }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('$50')).toBeDefined()
  })

  it('should_render_edit_link_for_active_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const link = screen.getByRole('link', { name: /^edit$/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/settings/tiers/tier-1')
  })

  it('should_render_edit_link_for_inactive_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-2', name: 'Premium', is_active: false }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const link = screen.getByRole('link', { name: /^edit$/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/settings/tiers/tier-2')
  })

  it('should_render_add_tier_link_navigating_to_new_page', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const [link] = screen.getAllByRole('link', { name: /add tier/i }) as HTMLAnchorElement[]
    expect(link.href).toContain('/barn/green-acres/settings/tiers/new')
  })

  it('should_not_render_add_tier_link_inside_summary', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /lesson tiers/i })
    const [link] = screen.getAllByRole('link', { name: /add tier/i })
    const summary = heading.closest('summary') as HTMLElement
    expect(summary.contains(link)).toBe(false)
  })

  it('should_render_add_tier_link_within_lesson_tiers_section', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /lesson tiers/i })
    const [link] = screen.getAllByRole('link', { name: /add tier/i })
    const sectionWrapper = heading.closest('details')!.parentElement as HTMLElement
    expect(sectionWrapper.contains(link)).toBe(true)
  })

  it('should_render_lesson_tiers_heading_in_label_style', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('heading', { name: /lesson tiers/i }).className).toContain('uppercase')
  })

  it('should_render_default_instructor_cut_heading', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('heading', { name: /default instructor cut/i })).toBeDefined()
  })

  it('should_render_instructor_cut_input_with_barn_default_value', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const input = screen.getByLabelText(/default per-lesson instructor cut/i) as HTMLInputElement
    expect(input.value).toBe(String(mockBarn.default_instructor_cut))
  })

  it('should_render_instructor_cut_does_not_affect_past_lessons_helper_text', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText(/doesn't affect past lessons/i)).toBeDefined()
  })

  it('should_render_default_board_fee_input_with_current_value', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const input = screen.getByLabelText(/monthly fee/i) as HTMLInputElement
    expect(input.value).toBe(String(mockBarn.default_board_fee))
  })

  it('should_render_non_retroactive_helper_text', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText(/applies to new boarding agreements only/i)).toBeDefined()
  })

  it('should_render_barn_timezone_select_with_current_value', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const select = screen.getByLabelText(/timezone/i) as HTMLSelectElement
    expect(select.value).toBe(mockBarn.timezone)
  })

  it('should_render_barn_timezone_section_closed_by_default', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /barn timezone/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('should_render_exhaustion_thresholds_heading_in_label_style', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('heading', { name: /horse exhaustion thresholds/i }).className).toContain('uppercase')
  })

  it('should_render_moderate_threshold_input_with_current_value', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const input = screen.getByLabelText(/moderate threshold/i) as HTMLInputElement
    expect(input.value).toBe(String(mockBarn.exhaustion_threshold_moderate))
  })

  it('should_render_high_threshold_input_with_current_value', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const input = screen.getByLabelText(/high threshold/i) as HTMLInputElement
    expect(input.value).toBe(String(mockBarn.exhaustion_threshold_high))
  })

  it('should_render_default_instructor_cut_section_closed_by_default', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /default instructor cut/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('should_render_exhaustion_thresholds_section_closed_by_default', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /horse exhaustion thresholds/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('should_render_lesson_tiers_section_closed_by_default', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /lesson tiers/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('should_render_default_board_fee_section_closed_by_default', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /default board fee/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('should_render_barn_events_section_closed_by_default', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /barn events/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('should_render_event_title_as_text_in_list', async () => {
    vi.mocked(getEventsByBarn).mockResolvedValue([
      createMockBarnEvent({ id: 'event-1', title: 'Costume Party' }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('Costume Party')).toBeDefined()
  })

  it('should_render_visible_to_roles_for_an_event', async () => {
    vi.mocked(getEventsByBarn).mockResolvedValue([
      createMockBarnEvent({ id: 'event-1', title: 'Costume Party', visible_to_roles: ['manager', 'rider'] }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('manager, rider')).toBeDefined()
  })

  it('should_render_edit_link_for_an_event', async () => {
    vi.mocked(getEventsByBarn).mockResolvedValue([
      createMockBarnEvent({ id: 'event-1', title: 'Costume Party' }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const link = screen.getByRole('link', { name: /^edit$/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/settings/events/event-1')
  })

  it('should_render_add_event_link_navigating_to_new_page', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const [link] = screen.getAllByRole('link', { name: /add event/i }) as HTMLAnchorElement[]
    expect(link.href).toContain('/barn/green-acres/settings/events/new')
  })

  it('should_render_empty_state_when_no_events', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText(/no events yet/i)).toBeDefined()
  })

  it('should_render_data_backup_heading_in_label_style', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('heading', { name: /data backup/i }).className).toContain('uppercase')
  })

  it('should_render_data_backup_section_closed_by_default', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /data backup/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('should_disable_download_button_when_barn_has_no_documents', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('button', { name: /download all documents/i }).hasAttribute('disabled')).toBe(true)
  })

  it('should_show_explanation_when_barn_has_no_documents', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('No documents to download yet.')).toBeDefined()
  })

  it('should_enable_download_button_when_barn_has_documents', async () => {
    vi.mocked(getAllBarnDocuments).mockResolvedValue({
      horse: [
        {
          id: 'doc-1',
          barn_id: 'barn-1',
          horse_id: 'horse-1',
          record_type: 'coggins',
          storage_path: 'barn-1/horses/horse-1/coggins.pdf',
          file_name: 'coggins.pdf',
          file_size: 1024,
          notes: null,
          reminder_date: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      trainer: [],
      rider: [],
    })

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('button', { name: /download all documents/i }).hasAttribute('disabled')).toBe(false)
  })

  it('should_show_description_when_barn_has_documents', async () => {
    vi.mocked(getAllBarnDocuments).mockResolvedValue({
      horse: [
        {
          id: 'doc-1',
          barn_id: 'barn-1',
          horse_id: 'horse-1',
          record_type: 'coggins',
          storage_path: 'barn-1/horses/horse-1/coggins.pdf',
          file_name: 'coggins.pdf',
          file_size: 1024,
          notes: null,
          reminder_date: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      trainer: [],
      rider: [],
    })

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText(/grouped by horse and member/i)).toBeDefined()
  })

  it('should_render_a_data_sub_block_with_an_always_enabled_download_button', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('button', { name: /download data/i }).hasAttribute('disabled')).toBe(false)
  })

  it('should_bind_the_download_data_button_to_downloadBarnDataAction_not_downloadAllDocumentsAction', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    fireEvent.submit(screen.getByRole('button', { name: /download data/i }).closest('form')!)

    await waitFor(() => expect(downloadBarnDataAction).toHaveBeenCalled())
    expect(downloadAllDocumentsAction).not.toHaveBeenCalled()
  })

  /** The `<details>` whose `<summary>` heading is exactly `title` (#1417). */
  function section(title: string): HTMLDetailsElement {
    const heading = [...document.querySelectorAll('summary h2')].find(
      (h) => h.textContent === title
    )
    return heading!.closest('details')!
  }

  it('should_open_the_saved_section_and_badge_it', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ saved: 'tiers' }),
    })
    render(jsx)

    expect(section('Lesson Tiers').open).toBe(true)
    expect(screen.getByText('Saved')).toBeDefined()
  })

  it('should_open_the_open_param_section_without_a_badge', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ open: 'events' }),
    })
    render(jsx)

    expect(section('Barn Events').open).toBe(true)
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('should_leave_every_section_closed_when_no_param_is_given', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect([...document.querySelectorAll('details')].map((d) => d.open)).toEqual(
      Array(8).fill(false)
    )
  })

  it('should_leave_every_section_closed_when_the_param_names_no_section', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ saved: 'not-a-section' }),
    })
    render(jsx)

    expect(screen.queryByText('Saved')).toBeNull()
    expect([...document.querySelectorAll('details')].map((d) => d.open)).toEqual(
      Array(8).fill(false)
    )
  })

  /**
   * #1557 — every section leads with one description, in one style, in one place. Asserted as a
   * table rather than eight bespoke tests because the AC is a uniformity claim: a description
   * that drifts in wording, size or position fails the same equality the others pass.
   *
   * The body is `<details>`' last element child — `headerExtra` renders between the summary and
   * the body, so `lastElementChild` is the one accessor correct for both section shapes.
   */
  function sectionBody(title: string): HTMLElement {
    return section(title).lastElementChild as HTMLElement
  }

  const DESCRIPTION_CLASS = 'mb-3 text-sm text-zinc-500 dark:text-zinc-400'

  const SECTION_DESCRIPTIONS: { section: string; text: string }[] = [
    {
      section: 'Default Instructor Cut',
      text: "Changing this doesn't affect past lessons — only new tiers and Custom lessons booked afterward.",
    },
    {
      section: 'Horse Exhaustion Thresholds',
      text: "Sets where a horse's exhaustion bar crosses into the moderate and high bands. Individual horses can override these.",
    },
    {
      section: 'Schedule Buffer',
      text: 'Instructors are notified when another instructor books a lesson within this many minutes of one of their own.',
    },
    {
      section: 'Lesson Tiers',
      text: 'Named lesson types with a set price, so booking a lesson is a pick rather than a price entry. The default tier is pre-selected on new lessons.',
    },
    {
      section: 'Barn Events',
      text: 'One-off dates on the barn calendar — shows, clinics, meetings, closures. Choose which roles see each one.',
    },
    {
      section: 'Default Board Fee',
      text: 'Applies to new boarding agreements only — existing boarders are unchanged.',
    },
    {
      section: 'Barn Timezone',
      text: "Every date and time in the app — lesson times, calendar days, and when charges fall due — is your barn's local time. This sets which zone that is.",
    },
    // The default mock has no documents, so this is the empty-state half of the Data Backup
    // documents description — the block it heads is still the section's first.
    { section: 'Data Backup', text: 'No documents to download yet.' },
  ]

  it.each(SECTION_DESCRIPTIONS)(
    'should_lead_the_$section_section_with_its_description',
    async ({ section: title, text }) => {
      const jsx = await SettingsPage({
        params: Promise.resolve({ slug: 'green-acres' }),
        searchParams: Promise.resolve({}),
      })
      render(jsx)

      const first = sectionBody(title).firstElementChild as HTMLElement
      expect({ tag: first.tagName, text: first.textContent, className: first.className }).toEqual({
        tag: 'P',
        text,
        className: DESCRIPTION_CLASS,
      })
    }
  )

  it('should_not_render_subheadings_under_data_backup', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(section('Data Backup').querySelectorAll('h3').length).toBe(0)
  })

  it('should_preserve_the_gap_between_the_two_data_backup_blocks', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    // `:scope > p` — the two descriptions, never a DownloadButton's error alert.
    const [, data] = sectionBody('Data Backup').querySelectorAll(':scope > p')
    expect(data.className).toBe(`mt-6 ${DESCRIPTION_CLASS}`)
  })
})
