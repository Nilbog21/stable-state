import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getEventById } from '@/lib/db/barn-events'
import { updateEventAction } from '../../actions'
import { EventForm } from '../EventForm'

export default async function EventEditPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()
  if (!user) redirect(`/barn/${slug}/login`)

  const membership = await getUserMembership(user.id, barn.id)
  if (!membership || membership.status !== 'active' || membership.role !== 'manager') {
    redirect(`/barn/${slug}/login`)
  }

  const event = await getEventById(id, barn.id, barn.timezone)
  if (!event) notFound()

  const save = updateEventAction.bind(null, slug, id)

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Edit Event
      </h1>
      <EventForm mode="edit" timezone={barn.timezone} initialEvent={event} action={save} deleteHref={`/barn/${slug}/settings/events/${id}/delete`} />
    </main>
  )
}
