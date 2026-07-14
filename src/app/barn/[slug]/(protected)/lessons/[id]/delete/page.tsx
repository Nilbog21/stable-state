import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getLessonById } from '@/lib/db/lessons'
import { deleteLessonAction } from '@/app/actions/lessons'
import { Button } from '@/components/ui/Button'

export default async function DeleteLessonPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const { user, barn, membership } = await requireMembership(slug, ['manager'])

  const lesson = await getLessonById(id, barn.id, membership.role, user.id)
  if (!lesson) notFound()

  const deleteLesson = deleteLessonAction.bind(null, barn.id, slug, lesson.id)

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Delete Lesson
      </h1>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        This lesson&apos;s ${lesson.fee} fee has already been collected. Deleting the lesson
        cannot be undone.
      </p>
      <form action={deleteLesson}>
        <label className="mb-6 flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" name="alsoDeleteTransactions" className="mt-1" />
          Also delete the collected ${lesson.fee} fee record from Finances
        </label>
        <Button type="submit" variant="danger">Confirm Delete</Button>
      </form>
    </main>
  )
}
