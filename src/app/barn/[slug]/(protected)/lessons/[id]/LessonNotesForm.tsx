'use client'

import { useState, useEffect, useTransition } from 'react'

interface LessonHorse {
  horse_notes: string | null
  exertion_level: number
  horses: { id: string; name: string } | null
}

interface LessonRider {
  rider_notes: string | null
  private_notes: string | null
  riders: { id: string; name: string; user_id: string | null } | null
}

interface Props {
  action: (formData: FormData) => Promise<void>
  horses: LessonHorse[]
  riders: LessonRider[]
}

export function LessonNotesForm({ action, horses, riders }: Props) {
  const [dirty, setDirty] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!dirty) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handleBeforeUnload)

    const originalPushState = window.history.pushState.bind(window.history)
    window.history.pushState = function(state, title, url) {
      if (url) {
        const next = new URL(String(url), window.location.href)
        if (next.pathname !== window.location.pathname && !window.confirm('You have unsaved changes. Leave without saving?')) {
          return
        }
      }
      originalPushState(state, title, url)
    }

    const handlePopState = () => {
      if (!window.confirm('You have unsaved changes. Leave without saving?')) {
        originalPushState(null, '', window.location.href)
      }
    }
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.history.pushState = originalPushState
      window.removeEventListener('popstate', handlePopState)
    }
  }, [dirty])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await action(formData)
      setDirty(false)
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      onChange={() => setDirty(true)}
      className="flex flex-col gap-6"
    >
      {horses.map((lh, i) => (
        <div key={lh.horses?.id ?? i}>
          <div className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {lh.horses?.name ?? '—'}{' '}
            <span className="text-zinc-500">(exertion {lh.exertion_level})</span>
          </div>
          {lh.horses?.id && (
            <>
              <input type="hidden" name="horseIds" value={lh.horses.id} />
              <div className="flex flex-col gap-1 rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Horse Notes</span>
                <textarea
                  name={`horse_notes_${lh.horses.id}`}
                  defaultValue={lh.horse_notes ?? ''}
                  rows={2}
                  className="w-full rounded border border-zinc-200 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            </>
          )}
        </div>
      ))}

      {riders.map((lr, i) => (
        <div key={lr.riders?.id ?? i}>
          <div className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">{lr.riders?.name ?? '—'}</div>
          {lr.riders?.id && (
            <>
              <input type="hidden" name="riderIds" value={lr.riders.id} />
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-zinc-500">Rider Notes</label>
                  <textarea
                    name={`rider_notes_${lr.riders.id}`}
                    defaultValue={lr.rider_notes ?? ''}
                    rows={2}
                    className="w-full rounded border border-zinc-200 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </div>
                <div className="flex flex-col gap-1 rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Private</span>
                  <textarea
                    name={`private_notes_${lr.riders.id}`}
                    defaultValue={lr.private_notes ?? ''}
                    rows={2}
                    className="w-full rounded border border-zinc-200 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      ))}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
