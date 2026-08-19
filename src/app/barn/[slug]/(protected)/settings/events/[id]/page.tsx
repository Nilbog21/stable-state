import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getEventById } from '@/lib/db/barn-events'
import { getScheduleRangeForBarn } from '@/app/actions/lessons'
import { updateEventAction } from '../../actions'
import { EventForm } from '../EventForm'

export default async function EventEditPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const { barn } = await requireMembership(slug, ['manager'])

  const event = await getEventById(id, barn.id, barn.timezone)
  if (!event) notFound()

  const save = updateEventAction.bind(null, slug, id)
  const getScheduleRange = getScheduleRangeForBarn.bind(null, barn.slug)

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Edit Event
      </h1>
      <EventForm
        mode="edit"
        timezone={barn.timezone}
        initialEvent={event}
        action={save}
        deleteHref={`/barn/${slug}/settings/events/${id}/delete`}
        getScheduleRange={getScheduleRange}
      />
    </main>
  )
}
