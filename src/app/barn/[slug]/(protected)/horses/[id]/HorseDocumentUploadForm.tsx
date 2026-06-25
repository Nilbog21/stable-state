'use client'

import { useState } from 'react'
import type { HorseDocumentType } from '@/lib/db/types'

const HORSE_TYPES: { value: HorseDocumentType; label: string }[] = [
  { value: 'insurance_binder', label: 'Insurance Binder' },
  { value: 'coggins', label: 'Coggins' },
  { value: 'shot_record', label: 'Shot Record' },
  { value: 'contract', label: 'Contract' },
  { value: 'other', label: 'Other' },
]

const MAX_FILE_SIZE = 5 * 1024 * 1024

interface Props {
  action: (formData: FormData) => Promise<void>
}

export function HorseDocumentUploadForm({ action }: Props) {
  const [selectedType, setSelectedType] = useState<HorseDocumentType>(HORSE_TYPES[0].value)
  const [fileError, setFileError] = useState<string | null>(null)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="record_type" value={selectedType} />

      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
          Document Type
        </label>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as HorseDocumentType)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {HORSE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
          File <span className="normal-case font-normal">(PDF, JPG, PNG, DOCX — max 5 MB)</span>
        </label>
        <input
          type="file"
          name="file"
          accept=".pdf,.jpg,.jpeg,.png,.docx"
          required
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file && file.size > MAX_FILE_SIZE) {
              setFileError('File exceeds 5 MB limit')
              e.target.value = ''
            } else {
              setFileError(null)
            }
          }}
          className="w-full text-sm text-zinc-700 dark:text-zinc-300"
        />
        {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
      </div>

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

      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Upload
      </button>
    </form>
  )
}
