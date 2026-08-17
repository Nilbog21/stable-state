'use client'

import { useActionState, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { RECORD_TYPE_OPTIONS, type DocumentEntity } from '@/lib/document-record-types'
import { useUnsavedChangesGuard } from '../../NavigationBlocker'

// Vercel hard-caps request bodies at 4.5 MB at the edge, independent of next.config.ts's bodySizeLimit.
const MAX_FILE_SIZE = 4500000

interface Props {
  entity: DocumentEntity
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
  cancelHref: string
  photoMode?: boolean
}

export function DocumentUploadForm({ entity, action, cancelHref, photoMode }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null })
  const types = RECORD_TYPE_OPTIONS[entity]
  const [selectedType, setSelectedType] = useState(types[0].value)
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [dirty, setDirty] = useState(false)
  useUnsavedChangesGuard(dirty)

  return (
    <form ref={formRef} action={formAction} className="space-y-4" onChange={() => setDirty(true)} onSubmit={() => setFileName(null)}>
      {state.error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {!photoMode && <input type="hidden" name="record_type" value={selectedType} />}

      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
          Document Type
        </label>
        {photoMode ? (
          <p className="text-sm text-zinc-900 dark:text-zinc-50">Photo</p>
        ) : (
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {types.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
          File <span className="normal-case font-normal">{photoMode ? '(JPG, PNG — max 4.5 MB)' : '(PDF, JPG, PNG, DOCX — max 4.5 MB)'}</span>
        </label>
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept={photoMode ? '.jpg,.jpeg,.png' : '.pdf,.jpg,.jpeg,.png,.docx'}
          required
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file && file.size > MAX_FILE_SIZE) {
              setFileError('File exceeds 4.5 MB limit')
              setFileName(null)
              e.target.value = ''
            } else {
              setFileError(null)
              setFileName(file?.name ?? null)
              if (file && photoMode) formRef.current?.requestSubmit()
            }
          }}
          className="sr-only"
        />
        <div className="flex items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
            Choose File
          </Button>
          {fileName && <span className="text-sm text-zinc-700 dark:text-zinc-300">{fileName}</span>}
        </div>
        {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
      </div>

      {!photoMode && (
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
            Notes <span className="normal-case font-normal">(optional)</span>
          </label>
          <input
            type="text"
            name="notes"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
      )}

      {!photoMode && (
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
            Expiration reminder date <span className="normal-case font-normal">(optional)</span>
          </label>
          <input
            type="date"
            name="reminder_date"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {pending ? 'Uploading…' : 'Upload'}
        </Button>
        <Button href={cancelHref} variant="secondary">
          Cancel
        </Button>
      </div>

      {pending && (
        <div role="progressbar" className="h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div className="h-full w-1/3 rounded-full bg-zinc-900 [animation:indeterminate-progress_1.2s_ease-in-out_infinite] dark:bg-zinc-50" />
        </div>
      )}
    </form>
  )
}
