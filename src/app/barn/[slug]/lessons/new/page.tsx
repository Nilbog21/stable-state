import { notFound } from 'next/navigation'
import { getBarnBySlug } from '@/lib/db/barns'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getRidersByBarn } from '@/lib/db/riders'
import { submitLesson } from '@/app/actions/lessons'
import { LessonForm } from './LessonForm'

export default async function LessonNewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)

  if (!barn) {
    notFound()
  }

  const [horses, riders] = await Promise.all([
    getHorsesByBarn(barn.id),
    getRidersByBarn(barn.id),
  ])

  const submit = submitLesson.bind(null, barn.id, barn.slug)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        New Lesson
      </h1>
      <LessonForm horses={horses} riders={riders} action={submit} />
    </main>
  )
}
