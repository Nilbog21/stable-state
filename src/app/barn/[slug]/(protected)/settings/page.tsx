import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getAllTiersByBarn } from '@/lib/db/lesson-tiers'
import { getEventsByBarn } from '@/lib/db/barn-events'
import { getAllBarnDocuments } from '@/lib/db/document-backup'
import { formatBarnDateTime } from '@/lib/format-date'
import {
  updateDefaultBoardFeeAction,
  updateInstructorCutAction,
  updateExhaustionThresholdsAction,
  updateScheduleBufferMinutesAction,
  updateBarnTimezoneAction,
  downloadAllDocumentsAction,
  downloadBarnDataAction,
} from './actions'
import { BARN_TIMEZONES } from '@/lib/barn-timezone'
import { Button } from '@/components/ui/Button'
import { AccordionSection } from '@/components/ui/AccordionSection'
import { Th, Td, TableActions } from '@/components/ui/Table'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { ExhaustionThresholdsForm } from './ExhaustionThresholdsForm'
import { GuardedForm } from '../NavigationBlocker'
import { DownloadButton } from './DownloadButton'

/**
 * #1557 — one style for every section's description, so the sizes can't drift apart again (two
 * sections had gone `text-xs`). Each description leads its section — or, in Data Backup's
 * two-download layout, its own block — above that block's controls.
 */
const DESCRIPTION_CLASS = 'mb-3 text-sm text-zinc-500 dark:text-zinc-400'

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { slug } = await params
  // #1417 — which section a save just landed in (`?saved=`), or should merely reopen
  // (`?open=`, for a delete). Threaded into every section rather than resolved here so the
  // deriving stays in one place; `AccordionSection` guards the undefined-matches-undefined case.
  const { saved, open } = await searchParams
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()
  if (!user) redirect(`/barn/${slug}/login`)

  const actorMembership = await getUserMembership(user.id, barn.id)

  if (
    !actorMembership ||
    actorMembership.status !== 'active' ||
    actorMembership.role !== 'manager'
  ) {
    redirect(`/barn/${slug}/login`)
  }

  const [tiers, events, barnDocuments] = await Promise.all([
    getAllTiersByBarn(barn.id),
    getEventsByBarn(barn.id, barn.timezone),
    getAllBarnDocuments(barn.id),
  ])

  const hasDocuments =
    barnDocuments.horse.length + barnDocuments.trainer.length + barnDocuments.rider.length > 0

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Manage Barn
      </h1>

      <AccordionSection title="Default Instructor Cut" slug="instructor-cut" savedSlug={saved} openSlug={open}>
        <p className={DESCRIPTION_CLASS}>
          Changing this doesn&apos;t affect past lessons — only new tiers and Custom lessons booked afterward.
        </p>
        <GuardedForm action={updateInstructorCutAction.bind(null, slug)} className="flex items-end gap-4">
          <div>
            <label
              htmlFor="instructor_cut"
              className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
            >
              Default per-lesson instructor cut ($)
            </label>
            <input
              type="number"
              id="instructor_cut"
              name="instructor_cut"
              min="0"
              step="0.01"
              required
              defaultValue={barn.default_instructor_cut}
              className="w-32 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </div>
          <Button type="submit">Save</Button>
        </GuardedForm>
      </AccordionSection>

      <AccordionSection title="Horse Exhaustion Thresholds" slug="exhaustion-thresholds" savedSlug={saved} openSlug={open}>
        <p className={DESCRIPTION_CLASS}>
          Sets where a horse&apos;s exhaustion bar crosses into the moderate and high bands. Individual horses can override these.
        </p>
        <ExhaustionThresholdsForm
          barn={barn}
          action={updateExhaustionThresholdsAction.bind(null, slug)}
        />
      </AccordionSection>

      <AccordionSection title="Schedule Buffer" slug="schedule-buffer" savedSlug={saved} openSlug={open}>
        <p className={DESCRIPTION_CLASS}>
          Instructors are notified when another instructor books a lesson within this many minutes of one of their own.
        </p>
        <GuardedForm action={updateScheduleBufferMinutesAction.bind(null, slug)} className="flex items-end gap-4">
          <div>
            <label
              htmlFor="schedule_buffer_minutes"
              className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
            >
              Buffer (minutes)
            </label>
            <input
              type="number"
              id="schedule_buffer_minutes"
              name="schedule_buffer_minutes"
              min="0"
              step="1"
              required
              defaultValue={barn.schedule_buffer_minutes}
              className="w-24 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </div>
          <Button type="submit">Save</Button>
        </GuardedForm>
      </AccordionSection>

      <AccordionSection
        title="Lesson Tiers"
        slug="tiers"
        savedSlug={saved}
        openSlug={open}
        headerExtra={<Button href={`/barn/${slug}/settings/tiers/new`}>Add Tier</Button>}
      >
        <p className={DESCRIPTION_CLASS}>
          Named lesson types with a set price, so booking a lesson is a pick rather than a price entry. The default tier is pre-selected on new lessons.
        </p>
        {tiers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Price</Th>
                  <Th>Default</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr key={tier.id}>
                    <Td>{tier.name}</Td>
                    <Td tone="secondary">${tier.price}</Td>
                    <Td>{tier.is_default && <Badge tone="gray">Default</Badge>}</Td>
                    <Td>
                      {tier.is_active ? (
                        <span className="text-zinc-700 dark:text-zinc-300">Active</span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">Inactive</span>
                      )}
                    </Td>
                    <TableActions>
                      <Button href={`/barn/${slug}/settings/tiers/${tier.id}`} variant="secondary" size="sm">
                        Edit
                      </Button>
                    </TableActions>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            heading="No tiers yet"
            subtext="Lesson tiers you add will appear here."
            cta={{ label: 'Add Tier', href: `/barn/${slug}/settings/tiers/new` }}
          />
        )}
      </AccordionSection>

      <AccordionSection
        title="Barn Events"
        slug="events"
        savedSlug={saved}
        openSlug={open}
        headerExtra={<Button href={`/barn/${slug}/settings/events/new`}>Add Event</Button>}
      >
        <p className={DESCRIPTION_CLASS}>
          One-off dates on the barn calendar — shows, clinics, meetings, closures. Choose which roles see each one.
        </p>
        {events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Title</Th>
                  <Th>Date</Th>
                  <Th>Visible To</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <Td>{event.title}</Td>
                    <Td tone="secondary">
                      {formatBarnDateTime(event.event_at)}
                    </Td>
                    <Td tone="secondary" className="capitalize">
                      {event.visible_to_roles.join(', ')}
                    </Td>
                    <TableActions>
                      <Button href={`/barn/${slug}/settings/events/${event.id}`} variant="secondary" size="sm">
                        Edit
                      </Button>
                    </TableActions>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            heading="No events yet"
            subtext="Barn events you add will appear here."
            cta={{ label: 'Add Event', href: `/barn/${slug}/settings/events/new` }}
          />
        )}
      </AccordionSection>

      <AccordionSection title="Default Board Fee" slug="board-fee" savedSlug={saved} openSlug={open}>
        <p className={DESCRIPTION_CLASS}>
          Applies to new boarding agreements only — existing boarders are unchanged.
        </p>
        <GuardedForm action={updateDefaultBoardFeeAction.bind(null, slug)} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="default_board_fee" className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
              Monthly fee ($)
            </label>
            <input
              id="default_board_fee"
              name="default_board_fee"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={barn.default_board_fee}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </div>
          <Button type="submit">Save</Button>
        </GuardedForm>
      </AccordionSection>

      <AccordionSection title="Barn Timezone" slug="timezone" savedSlug={saved} openSlug={open}>
        <p className={DESCRIPTION_CLASS}>
          Every date and time in the app — lesson times, calendar days, and when charges fall due — is your barn&apos;s local time. This sets which zone that is.
        </p>
        <GuardedForm action={updateBarnTimezoneAction.bind(null, slug)} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="timezone" className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
              Timezone
            </label>
            <select
              id="timezone"
              name="timezone"
              defaultValue={barn.timezone}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            >
              {BARN_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">Save</Button>
        </GuardedForm>
      </AccordionSection>

      {/* #1557 — no `<h3>` per sub-block: each description and its button name already say which
          of the two downloads it is. The second description carries the `mt-6` the deleted
          heading held, so the gap between the blocks survives the deletion. */}
      <AccordionSection title="Data Backup">
        <p className={DESCRIPTION_CLASS}>
          {hasDocuments
            ? 'Downloads every horse, trainer, and rider document as one zip archive, grouped by horse and member.'
            : 'No documents to download yet.'}
        </p>
        <DownloadButton
          action={downloadAllDocumentsAction.bind(null, slug)}
          disabled={!hasDocuments}
          label="Download All Documents"
        />

        <p className={`mt-6 ${DESCRIPTION_CLASS}`}>
          Downloads a spreadsheet of your horses, lessons, agreements, expenses, transactions, members, and document records — one sheet per record type.
        </p>
        <DownloadButton
          action={downloadBarnDataAction.bind(null, slug)}
          disabled={false}
          label="Download Data"
        />
      </AccordionSection>
    </main>
  )
}
