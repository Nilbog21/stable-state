'use client'

import { useRef, useState } from 'react'
import type { TrainerDocumentType, RiderDocumentType } from '@/lib/db/types'
import { Button } from '@/components/ui/Button'

const TRAINER_TYPES: { value: TrainerDocumentType; label: string }[] = [
  { value: 'instructor_contract', label: 'Instructor Contract' },
  { value: 'other', label: 'Other' },
]

const RIDER_TYPES: { value: RiderDocumentType; label: string }[] = [
  { value: 'liability_waiver', label: 'Liability Waiver' },
  { value: 'lease_agreement', label: 'Lease Agreement' },
  { value: 'boarding_contract', label: 'Boarding Contract' },
  { value: 'other', label: 'Other' },
]

const MAX_FILE_SIZE = 5 * 1024 * 1024

interface Props {
  memberRole: 'trainer' | 'rider' | 'manager'
  action: (formData: FormData) => Promise<{ error: string | null }>
}

export function UploadForm({ memberRole, action }: Props) {
  const types = memberRole === 'rider' ? RIDER_TYPES : TRAINER_TYPES
  const [selectedType, setSelectedType] = useState(types[0].value)
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFileName(null)
    setUploadError(null)
    const result = await action(new FormData(e.currentTarget))
    if (result.error) setUploadError(result.error)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="record_type" value={selectedType} />

      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
          Document Type
        </label>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as TrainerDocumentType | RiderDocumentType)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {types.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
          File <span className="normal-case font-normal">(PDF, JPG, PNG, DOCX — max 5 MB)</span>
        </label>
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".pdf,.jpg,.jpeg,.png,.docx"
          required
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file && file.size > MAX_FILE_SIZE) {
              setFileError('File exceeds 5 MB limit')
              setFileName(null)
              e.target.value = ''
            } else {
              setFileError(null)
              setFileName(file?.name ?? null)
            }
          }}
          className="sr-only"
        />
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" onClick={() => inputRef.current?.click()}>
            Choose File
          </Button>
          {fileName && <span className="text-sm text-zinc-700 dark:text-zinc-300">{fileName}</span>}
        </div>
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

      {uploadError && <p className="text-xs text-red-600 dark:text-red-400">{uploadError}</p>}

      <Button type="submit">Upload</Button>
    </form>
  )
}
