'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'

interface Props {
  docId: string
  storagePath: string
  action: (docId: string, storagePath: string) => Promise<{ error: string | null }>
}

export function DeleteDocumentButton({ docId, storagePath, action }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const result = await action(docId, storagePath)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit}>
      <Button type="submit" variant="danger" size="sm">
        Delete
      </Button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  )
}
