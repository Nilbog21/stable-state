import { requireMembership } from '@/lib/auth/guard'
import { getScheduleRangeForBarn } from '@/app/actions/lessons'
import { createEventAction } from '../../actions'
import { EventForm } from '../EventForm'

export default async function EventNewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { barn } = await requireMembership(slug, ['manager'])

  const save = createEventAction.bind(null, slug)
  const getScheduleRange = getScheduleRangeForBarn.bind(null, barn.slug)

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        New Event
      </h1>
      <EventForm mode="new" timezone={barn.timezone} action={save} getScheduleRange={getScheduleRange} />
    </main>
  )
}
