'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useNavigationBlocker, type PendingNav } from '../../NavigationBlocker'

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
  const { dirty, setDirty, pendingNav, setPendingNav } = useNavigationBlocker()
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const ignoreNextPopState = useRef(false)
  const router = useRouter()

  useEffect(() => {
    return () => { setDirty(false) }
  }, [setDirty])

  useEffect(() => {
    if (!dirty) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handleBeforeUnload)

    const handlePopState = () => {
      if (ignoreNextPopState.current) {
        ignoreNextPopState.current = false
        return
      }
      window.history.pushState(null, '', window.location.href)
      setPendingNav({ type: 'back' })
    }
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [dirty, setPendingNav])

  function proceed(nav: NonNullable<PendingNav>) {
    if (nav.type === 'push') {
      router.push(nav.href)
    } else {
      ignoreNextPopState.current = true
      window.history.back()
    }
  }

  function handleSaveAndLeave() {
    const nav = pendingNav!
    const formData = new FormData(formRef.current!)
    startTransition(async () => {
      await action(formData)
      setDirty(false)
      setPendingNav(null)
      proceed(nav)
    })
  }

  function handleDiscard() {
    const nav = pendingNav!
    setDirty(false)
    setPendingNav(null)
    proceed(nav)
  }

  function handleCancel() {
    setPendingNav(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await action(formData)
      setDirty(false)
    })
  }

  return (
    <>
      {pendingNav && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">Unsaved changes</h2>
            <p className="mb-6 text-sm text-zinc-500">Would you like to save your changes?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSaveAndLeave}
                disabled={isPending}
                className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isPending ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={handleDiscard}
                className="w-full rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Discard changes
              </button>
              <button
                onClick={handleCancel}
                className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <form
        ref={formRef}
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
    </>
  )
}
