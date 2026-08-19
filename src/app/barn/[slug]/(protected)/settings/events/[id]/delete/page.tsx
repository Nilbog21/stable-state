import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getEventById } from '@/lib/db/barn-events'
import { deleteEventAction } from '../../../actions'
import { Button } from '@/components/ui/Button'

export default async function DeleteEventPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const { barn } = await requireMembership(slug, ['manager'])

  const event = await getEventById(id, barn.id, barn.timezone)
  if (!event) notFound()

  const deleteEvent = deleteEventAction.bind(null, slug, event.id)

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Delete Event
      </h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        This will permanently delete &ldquo;{event.title}&rdquo;. This cannot be undone.
      </p>
      <form action={deleteEvent}>
        <Button type="submit" variant="danger">Confirm Delete</Button>
      </form>
    </main>
  )
}
